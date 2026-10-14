// The AWS SDK half of the R2 helpers: presigned PUTs, HEAD, list + delete.
// Kept out of r2.ts and only loaded via dynamic import() when one of these is
// actually called. Evaluating the SDK at module load pushed every page that
// imports r2.ts (all of /admin/galleries) past the Workers free-plan CPU limit
// (Error 1102), even pages that never touch it.
import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
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
    // Workers have no filesystem. Any option left unset makes the SDK look it
    // up from ~/.aws/config or env via fs.readFile, which throws on Workers
    // ("[unenv] fs.readFile is not implemented yet!"). Set them all explicitly.
    useDualstackEndpoint: false,
    useFipsEndpoint: false,
    useArnRegion: false,
    disableS3ExpressSessionAuth: true,
    defaultsMode: "standard",
    maxAttempts: 3,
    retryMode: "standard",
    userAgentAppId: "proofer",
    authSchemePreference: [],
    disableClockSkewCorrection: false,
    // The default Node handler uses node:https, which Workers don't implement
    // ("[unenv] https.request is not implemented yet!"). Use fetch instead.
    requestHandler: new FetchHttpHandler(),
    sigv4aSigningRegionSet: [],
  });
}

export async function presignPut(key: string, contentType: string, expiresInSeconds = 900) {
  const command = new PutObjectCommand({ Bucket: env.r2().bucket, Key: key, ContentType: contentType });
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
