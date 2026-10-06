// Cloudflare R2 client (S3-compatible) + the media helpers used by galleries
// (Phase 5). Media bytes never pass through the Worker: uploads are presigned
// PUTs straight from the browser, reads are short-lived presigned GETs.
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

export function r2Client() {
  const c = env.r2();
  return new S3Client({
    region: "auto",
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    // Newer AWS SDKs add CRC32 checksums to every request by default, which
    // bakes a checksum of an empty body into presigned PUT URLs and breaks
    // browser uploads to R2. Only send checksums where S3 requires them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

// Lets pages render a "not configured" notice instead of erroring before
// David has created the media bucket and Worker secrets.
export function r2Configured(): boolean {
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].every(
    (name) => !!process.env[name]
  );
}

export async function presignPut(key: string, contentType: string, expiresInSeconds = 900) {
  const command = new PutObjectCommand({ Bucket: env.r2().bucket, Key: key, ContentType: contentType });
  return getSignedUrl(r2Client(), command, { expiresIn: expiresInSeconds });
}

export async function presignGet(key: string, expiresInSeconds = 900) {
  const command = new GetObjectCommand({ Bucket: env.r2().bucket, Key: key });
  return getSignedUrl(r2Client(), command, { expiresIn: expiresInSeconds });
}

// A GET that R2 serves as a file download (Content-Disposition is part of the
// signature, so the client can't change it).
export async function presignDownload(key: string, contentDisposition: string, expiresInSeconds: number) {
  const command = new GetObjectCommand({
    Bucket: env.r2().bucket,
    Key: key,
    ResponseContentDisposition: contentDisposition,
  });
  return getSignedUrl(r2Client(), command, { expiresIn: expiresInSeconds });
}

// Returns the stored object's size, or null if it doesn't exist.
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const res = await r2Client().send(new HeadObjectCommand({ Bucket: env.r2().bucket, Key: key }));
    return res.ContentLength ?? null;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

// Deletes every object under a prefix whose key passes `keep` (default: all).
// Lists then deletes 1000 keys per request (the S3 cap), so a whole
// collection costs a handful of subrequests, not one per photo — Workers cap
// subrequests per invocation.
export async function deletePrefix(prefix: string, matches: (key: string) => boolean = () => true) {
  const client = r2Client();
  const bucket = env.r2().bucket;

  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken })
    );
    for (const o of page.Contents ?? []) if (o.Key && matches(o.Key)) keys.push(o.Key);
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    const res = await client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } })
    );
    if (res.Errors && res.Errors.length > 0) {
      throw new Error(`R2 delete failed for ${res.Errors.length} object(s) under ${prefix}`);
    }
  }
}
