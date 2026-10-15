// Signed playback tokens for Cloudflare Stream (Phase 6.4). Pure, no imports,
// so Node's test runner can load it. Videos are created with
// requireSignedURLs, so the player and thumbnails only work with a token.
//
// Tokens are signed here with a Stream signing key (an RS256 JWT), not by
// calling Stream's /token API, so a gallery page with ten videos costs no
// extra requests and there's no daily token budget to run into.

// Six hours: long enough to finish a feature-length film or come back to a
// tab left open, short enough that a copied link stops working the same day.
export const PLAYBACK_TOKEN_TTL_SECONDS = 6 * 60 * 60;

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

const keyCache = new Map<string, Promise<CryptoKey>>();

// Stream hands the key out base64-encoded (the `jwk` field when the key is
// created); that string is what gets stored as the secret.
function importSigningKey(jwkBase64: string): Promise<CryptoKey> {
  let key = keyCache.get(jwkBase64);
  if (!key) {
    const jwk = JSON.parse(atob(jwkBase64.trim())) as JsonWebKey;
    key = crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    keyCache.set(jwkBase64, key);
    key.catch(() => keyCache.delete(jwkBase64));
  }
  return key;
}

export async function signPlaybackToken(opts: {
  keyId: string;
  jwkBase64: string;
  videoUid: string;
  nowSeconds: number;
  ttlSeconds?: number;
}): Promise<string> {
  if (!/^[0-9a-f]{32}$/i.test(opts.videoUid)) throw new Error("Bad Stream video id");
  const header = base64urlJson({ alg: "RS256", kid: opts.keyId });
  const payload = base64urlJson({
    sub: opts.videoUid,
    kid: opts.keyId,
    exp: opts.nowSeconds + (opts.ttlSeconds ?? PLAYBACK_TOKEN_TTL_SECONDS),
  });
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await importSigningKey(opts.jwkBase64), new TextEncoder().encode(data));
  return `${data}.${base64url(new Uint8Array(sig))}`;
}

// customer-<code>.cloudflarestream.com, where <code> is the account's
// playback subdomain. Validated so a bad env value can't point the player
// anywhere else.
function streamHost(customerCode: string): string {
  const code = customerCode.replace(/^customer-/, "").replace(/\.cloudflarestream\.com$/, "");
  if (!/^[a-z0-9]{8,64}$/i.test(code)) throw new Error("CF_STREAM_CUSTOMER_CODE doesn't look right");
  return `https://customer-${code.toLowerCase()}.cloudflarestream.com`;
}

export function playerUrl(customerCode: string, token: string): string {
  return `${streamHost(customerCode)}/${token}/iframe?preload=metadata`;
}

export function thumbnailUrl(customerCode: string, token: string, height = 640): string {
  return `${streamHost(customerCode)}/${token}/thumbnails/thumbnail.jpg?time=1s&height=${height}`;
}
