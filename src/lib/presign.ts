// Fast SigV4 presigned GET URLs for R2, using only WebCrypto.
//
// Why this exists: the AWS SDK's presigner builds a full client and middleware
// stack per URL, a few ms of CPU each. A gallery page signs one URL per photo,
// which blows the Workers free-plan CPU limit (Error 1102). This does one
// SHA-256 + one HMAC per URL and derives the signing key once per day.
//
// Output is byte-identical to the SDK's getSignedUrl for a GetObjectCommand
// (locked in by presign.test.ts). Only GET is supported; PUT stays on the SDK.

const enc = new TextEncoder();

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// RFC 3986 encoding, as S3 SigV4 requires (encodeURIComponent leaves !'()*).
const encode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

async function hmac(key: BufferSource | CryptoKey, data: string): Promise<ArrayBuffer> {
  const k =
    key instanceof CryptoKey
      ? key
      : await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

// The signing key only changes with the secret and the UTC date, so keep the
// latest one for the life of the isolate.
let cachedKey: { id: string; key: CryptoKey } | null = null;

async function signingKey(secretAccessKey: string, date: string): Promise<CryptoKey> {
  const id = `${date}:${secretAccessKey}`;
  if (cachedKey?.id === id) return cachedKey.key;
  const kDate = await hmac(enc.encode("AWS4" + secretAccessKey), date);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const key = await crypto.subtle.importKey("raw", kSigning, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  cachedKey = { id, key };
  return key;
}

export type PresignGetOptions = {
  accountId: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresIn: number;
  responseContentDisposition?: string;
  now?: Date;
};

export async function presignGetUrl(o: PresignGetOptions): Promise<string> {
  const iso = (o.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20261008T123456Z
  const date = iso.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const host = `${o.bucket}.${o.accountId}.r2.cloudflarestorage.com`.toLowerCase();
  const path = "/" + o.key.split("/").map(encode).join("/");

  const params: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"],
    ["X-Amz-Credential", `${o.accessKeyId}/${scope}`],
    ["X-Amz-Date", iso],
    ["X-Amz-Expires", String(o.expiresIn)],
    ["X-Amz-SignedHeaders", "host"],
    ["x-id", "GetObject"],
  ];
  if (o.responseContentDisposition) params.push(["response-content-disposition", o.responseContentDisposition]);

  const query = (list: [string, string][]) =>
    list
      .map(([k, v]) => [encode(k), encode(v)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");

  const canonicalRequest = ["GET", path, query(params), `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const hash = hex(await crypto.subtle.digest("SHA-256", enc.encode(canonicalRequest)));
  const stringToSign = ["AWS4-HMAC-SHA256", iso, scope, hash].join("\n");
  const signature = hex(await hmac(await signingKey(o.secretAccessKey, date), stringToSign));

  return `https://${host}${path}?${query([...params, ["X-Amz-Signature", signature]])}`;
}
