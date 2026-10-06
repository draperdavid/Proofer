// Gallery privacy (Phase 5.3): password hashing, signed unlock cookies, and
// the access decision. WebCrypto only and no imports, so the Worker and Node's
// test runner share it.

export const VISIBILITIES = ["public", "password", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type AccessDecision = "granted" | "needs_password" | "private" | "not_found";

// Drafts are never viewable. Private stays closed until client sign-in for
// galleries is wired (see the 2026-10-05 report): today any signed-in Supabase
// user also passes the /admin gate, so inviting clients to sign in isn't safe.
export function decideAccess(
  collection: { status: string; visibility: string },
  hasValidUnlock: boolean
): AccessDecision {
  if (collection.status !== "published") return "not_found";
  switch (collection.visibility) {
    case "public":
      return "granted";
    case "password":
      return hasValidUnlock ? "granted" : "needs_password";
    case "private":
      return "private";
    default:
      return "not_found";
  }
}

// ------------------------------------------------------------------ passwords

export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 200;

// Cloudflare Workers cap PBKDF2 at 100k iterations. The count is stored in
// each hash, so it can change later without breaking existing passwords.
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

// Shared gallery passwords get copy-pasted from emails, so stray spaces are
// trimmed on both set and check.
export function normalizePassword(raw: string): string {
  return raw.trim();
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Gallery password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Gallery password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Plain ArrayBuffer-backed bytes, which is what WebCrypto's types accept.
type Bytes = Uint8Array<ArrayBuffer>;

function fromBase64Url(value: string): Bytes | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Bytes, iterations: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

// Format: pbkdf2_sha256$<iterations>$<salt>$<hash>, base64url parts.
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  const salt = fromBase64Url(parts[2]);
  const expected = fromBase64Url(parts[3]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  if (!salt || !expected || expected.length !== HASH_BYTES) return false;

  const actual = await pbkdf2(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

// -------------------------------------------------------------- unlock cookie
// One httpOnly cookie per unlocked gallery. The value is
// `<collectionId>.<accessVersion>.<expiresAtSeconds>.<hmac>`, HMAC-SHA256 with
// GALLERY_ACCESS_SECRET. It only unlocks the collection named inside it, and
// only while that collection's access_version still matches.

export const UNLOCK_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MIN_SECRET_LENGTH = 32;

export function unlockCookieName(collectionId: string): string {
  return `gallery_${collectionId.replace(/[^a-zA-Z0-9-]/g, "")}`;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error("Gallery access secret is too short");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

// Generic HMAC over a dot-free payload, shared with the favorites visitor
// cookie (favorites.ts).
export async function signPayload(secret: string, payload: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

export async function verifyPayload(secret: string, payload: string, sigPart: string): Promise<boolean> {
  const sig = fromBase64Url(sigPart);
  if (!sig) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret), sig, new TextEncoder().encode(payload));
}

export function encodeText(value: string): string {
  return toBase64Url(new TextEncoder().encode(value));
}

export function decodeText(value: string): string | null {
  const bytes = fromBase64Url(value);
  if (!bytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export async function signUnlockToken(
  secret: string,
  claim: { collectionId: string; accessVersion: number; expiresAt: number }
): Promise<string> {
  const payload = `${claim.collectionId}.${claim.accessVersion}.${claim.expiresAt}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

// `now` is in seconds. Any malformed, forged, expired, wrong-gallery or
// stale-version token is simply "not unlocked".
export async function verifyUnlockToken(
  secret: string,
  token: string,
  expected: { collectionId: string; accessVersion: number; now: number }
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [collectionId, version, expiresAt, sigPart] = parts;

  const sig = fromBase64Url(sigPart);
  if (!sig) return false;
  const payload = `${collectionId}.${version}.${expiresAt}`;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, new TextEncoder().encode(payload));
  if (!valid) return false;

  return (
    collectionId === expected.collectionId &&
    Number(version) === expected.accessVersion &&
    Number(expiresAt) > expected.now
  );
}
