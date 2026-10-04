// Variants job (Phase 5.2): finds uploaded photos without size variants,
// resizes them with sharp, uploads the JPEGs beside the original in R2 and
// marks the row ready. Run by .github/workflows/variants.yml via
// `npm run variants` (Node >= 22.18 strips the types).
//
// Kept out of the Worker on purpose: resizing a 100 MB original would blow the
// Workers CPU limit, and a GitHub runner does it for free.
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { MAX_VARIANT_ATTEMPTS, VARIANT_SIZES, variantKey, type Variants } from "../src/lib/galleries/variants.ts";
import { renderVariants } from "../src/lib/galleries/render-variants.ts";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];
const BATCH = 100;
const CONCURRENCY = 2;

type PendingAsset = { id: string; collection_id: string; r2_key: string; variant_attempts: number };

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  // Not an error: the hourly schedule shouldn't go red before the secrets exist.
  console.log(`Variants job not configured (missing ${missing.join(", ")}), skipping.`);
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

async function processAsset(asset: PendingAsset): Promise<void> {
  const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: asset.r2_key }));
  if (!obj.Body) throw new Error("original has no body");
  const original = Buffer.from(await obj.Body.transformToByteArray());

  const rendered = await renderVariants(original, VARIANT_SIZES);
  const variants: Variants = {};
  for (const r of rendered) {
    const key = variantKey(asset.collection_id, asset.id, r.size as (typeof VARIANT_SIZES)[number]);
    await r2.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: r.data, ContentType: "image/jpeg" })
    );
    variants[String(r.size)] = { key, width: r.width, height: r.height };
  }

  const { data, error } = await db
    .from("media_assets")
    .update({ variants, variants_ready: true, variant_error: null })
    .eq("id", asset.id)
    .select("id");
  if (error) throw error;

  // The photo was deleted while we worked on it: its prefix delete has already
  // run, so remove what we just wrote rather than leave orphans.
  if (!data || data.length === 0) {
    const keys = Object.values(variants).map((v) => ({ Key: v!.key }));
    await r2.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
    console.log(`${asset.id}: deleted during processing, variants removed`);
  }
}

async function main() {
  const { data, error } = await db
    .from("media_assets")
    .select("id, collection_id, r2_key, variant_attempts")
    .eq("status", "uploaded")
    .eq("variants_ready", false)
    .lt("variant_attempts", MAX_VARIANT_ATTEMPTS)
    .order("created_at")
    .limit(BATCH);
  if (error) throw error;

  const queue = [...((data ?? []) as PendingAsset[])];
  console.log(`${queue.length} photo(s) need variants`);

  let done = 0;
  let failed = 0;
  async function worker() {
    for (let asset = queue.shift(); asset; asset = queue.shift()) {
      try {
        await processAsset(asset);
        done++;
      } catch (err) {
        failed++;
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        console.error(`${asset.id}: ${message}`);
        const { error: markErr } = await db
          .from("media_assets")
          .update({ variant_attempts: asset.variant_attempts + 1, variant_error: message })
          .eq("id", asset.id);
        if (markErr) console.error(`${asset.id}: couldn't record failure: ${markErr.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Done: ${done} processed, ${failed} failed`);
  // A red run is the alert that something needs a look.
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
