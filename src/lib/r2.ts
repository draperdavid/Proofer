// Cloudflare R2 client (S3-compatible). First used in Phase 5 (media). Stub-ready now.
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export function r2Client() {
  const c = env.r2();
  return new S3Client({
    region: "auto",
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
}
