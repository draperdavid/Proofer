// Cloudflare R2 helpers used by galleries (Phase 5). Media bytes never pass
// through the Worker: uploads are presigned PUTs straight from the browser,
// reads are short-lived presigned GETs. GETs are signed here with WebCrypto;
// everything that needs the AWS SDK lives in r2-sdk.ts and is loaded lazily.
import { env } from "./env";
import { presignGetUrl } from "./presign";

// Lets pages render a "not configured" notice instead of erroring before
// David has created the media bucket and Worker secrets.
export function r2Configured(): boolean {
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].every(
    (name) => !!process.env[name]
  );
}

// GET URLs use the lightweight signer in presign.ts, not the SDK: a gallery page
// signs one per photo and the SDK's per-URL cost exceeds the Workers free-plan
// CPU limit (Error 1102).
export async function presignGet(key: string, expiresInSeconds = 900) {
  return presignGetUrl({ ...env.r2(), key, expiresIn: expiresInSeconds });
}

// A GET that R2 serves as a file download (Content-Disposition is part of the
// signature, so the client can't change it).
export async function presignDownload(key: string, contentDisposition: string, expiresInSeconds: number) {
  return presignGetUrl({
    ...env.r2(),
    key,
    expiresIn: expiresInSeconds,
    responseContentDisposition: contentDisposition,
  });
}

// SDK-backed operations, loaded on first use.
export async function presignPut(key: string, contentType: string, expiresInSeconds = 900) {
  return (await import("./r2-sdk")).presignPut(key, contentType, expiresInSeconds);
}

// Returns the stored object's size, or null if it doesn't exist.
export async function headObjectSize(key: string): Promise<number | null> {
  return (await import("./r2-sdk")).headObjectSize(key);
}

// Deletes every object under a prefix whose key passes `keep` (default: all).
export async function deletePrefix(prefix: string, matches?: (key: string) => boolean) {
  return (await import("./r2-sdk")).deletePrefix(prefix, matches);
}
