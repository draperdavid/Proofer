// Video web-copy job (Phase 6, free version): finds uploaded videos without a
// web copy, makes one with ffmpeg plus a poster frame, uploads both beside
// the original in R2 and marks the row ready. Runs in the same GitHub
// Actions workflow as photo variants (.github/workflows/variants.yml):
//
//   npm run video-web -- --check   writes pending=true|false to $GITHUB_OUTPUT
//   npm run video-web              does the work (needs ffmpeg + ffprobe)
//
// Free and off the Worker on purpose: a GitHub runner has the disk and CPU
// for a multi-gigabyte film, and the Worker never touches video bytes.
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { MAX_VARIANT_ATTEMPTS } from "../src/lib/galleries/variants.ts";
import { posterArgs, posterKey, webCopyArgs, webVideoKey } from "../src/lib/galleries/video.ts";

const run = promisify(execFile);

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];
// A long film can take a while to encode; a few per run keeps each run well
// inside the workflow timeout. The rest wait for the next hour.
const BATCH = 3;

type PendingVideo = { id: string; collection_id: string; r2_key: string; variant_attempts: number };

const checkOnly = process.argv.includes("--check");

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.log(`Video job not configured (missing ${missing.join(", ")}), skipping.`);
  if (checkOnly && process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "pending=false\n");
  process.exit(0);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const bucket = process.env.R2_BUCKET!;
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

async function pending(limit: number): Promise<PendingVideo[]> {
  const { data, error } = await db
    .from("media_assets")
    .select("id, collection_id, r2_key, variant_attempts")
    .eq("status", "uploaded")
    .eq("kind", "video")
    .eq("variants_ready", false)
    .lt("variant_attempts", MAX_VARIANT_ATTEMPTS)
    .order("created_at")
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PendingVideo[];
}

async function probe(file: string): Promise<{ duration: number; width: number; height: number }> {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json", file,
  ]);
  const json = JSON.parse(stdout) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
  const s = json.streams?.[0];
  if (!s?.width || !s?.height) throw new Error("no video stream found");
  return { duration: Number(json.format?.duration) || 0, width: s.width, height: s.height };
}

async function upload(key: string, file: string, contentType: string) {
  const { size } = await stat(file);
  await r2.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(file), ContentLength: size, ContentType: contentType })
  );
}

async function processVideo(v: PendingVideo, dir: string): Promise<void> {
  const ext = v.r2_key.split(".").pop() ?? "mp4";
  const original = join(dir, `${v.id}-original.${ext}`);
  const web = join(dir, `${v.id}-web.mp4`);
  const poster = join(dir, `${v.id}-poster.jpg`);
  try {
    // Streamed to disk: an original can be several GB.
    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: v.r2_key }));
    if (!obj.Body) throw new Error("original has no body");
    await pipeline(obj.Body as Readable, createWriteStream(original));

    await run("ffmpeg", webCopyArgs(original, web), { maxBuffer: 16 * 1024 * 1024 });
    const info = await probe(web);
    await run("ffmpeg", posterArgs(web, poster, info.duration));

    const webKey = webVideoKey(v.collection_id, v.id);
    const posterK = posterKey(v.collection_id, v.id);
    await upload(webKey, web, "video/mp4");
    await upload(posterK, poster, "image/jpeg");

    const { data, error } = await db
      .from("media_assets")
      .update({
        variants: {
          web: { key: webKey, width: info.width, height: info.height },
          poster: { key: posterK, width: info.width, height: info.height },
        },
        variants_ready: true,
        variant_error: null,
        duration_seconds: info.duration > 0 ? Math.round(info.duration * 10) / 10 : null,
        width: info.width,
        height: info.height,
      })
      .eq("id", v.id)
      .select("id");
    if (error) throw error;
    // Deleted while we worked: its prefix delete already ran, so don't leave orphans.
    if (!data || data.length === 0) {
      await r2.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: [{ Key: webKey }, { Key: posterK }], Quiet: true } })
      );
      console.log(`${v.id}: deleted during processing, web copy removed`);
    }
  } finally {
    await rm(original, { force: true });
    await rm(web, { force: true });
    await rm(poster, { force: true });
  }
}

async function main() {
  if (checkOnly) {
    const has = (await pending(1)).length > 0;
    console.log(has ? "Videos waiting for a web copy" : "No videos waiting");
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `pending=${has}\n`);
    return;
  }

  const queue = await pending(BATCH);
  console.log(`${queue.length} video(s) need a web copy`);
  const dir = await mkdtemp(join(tmpdir(), "proofer-video-"));
  let done = 0;
  let failed = 0;
  try {
    // One at a time: ffmpeg already uses every core.
    for (const v of queue) {
      try {
        await processVideo(v, dir);
        done++;
        console.log(`${v.id}: done`);
      } catch (err) {
        failed++;
        const e = err as { stderr?: string; message?: string };
        const message = (e.stderr?.trim() || e.message || String(err)).slice(0, 500);
        console.error(`${v.id}: ${message}`);
        const { error: markErr } = await db
          .from("media_assets")
          .update({ variant_attempts: v.variant_attempts + 1, variant_error: message })
          .eq("id", v.id);
        if (markErr) console.error(`${v.id}: couldn't record failure: ${markErr.message}`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(`Done: ${done} processed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
