// Favorites (Phase 5.6): who the visitor says they are, and the signed cookie
// that remembers it per gallery. Pure WebCrypto, no imports beyond access.ts,
// so Node's test runner can exercise it.
//
// The email is NOT verified: anyone who can open a gallery can type any email.
// That matches Pixieset, and the worst case is editing someone else's picks in
// a gallery you already have access to. Real client sign-in will replace it.
import { decodeText, encodeText, signPayload, verifyPayload } from "./access.ts";

export const VISITOR_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Lowercased + trimmed, or null if it doesn't look like an email. Mirrors the
// favorites.visitor_email check in 0014.
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_PATTERN.test(email) ? email : null;
}

export function visitorCookieName(collectionId: string): string {
  return `gfav_${collectionId.replace(/[^a-zA-Z0-9-]/g, "")}`;
}

// `<collectionId>.<base64url email>.<expiresAt>.<hmac>`. Identity only: access
// to the gallery is still re-checked on every request, so this cookie never
// opens anything by itself.
export async function signVisitorToken(
  secret: string,
  claim: { collectionId: string; email: string; expiresAt: number }
): Promise<string> {
  const payload = `${claim.collectionId}.${encodeText(claim.email)}.${claim.expiresAt}`;
  return `${payload}.${await signPayload(secret, payload)}`;
}

// The verified email, or null for anything malformed, forged, expired or
// issued for another gallery.
export async function verifyVisitorToken(
  secret: string,
  token: string,
  expected: { collectionId: string; now: number }
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [collectionId, emailPart, expiresAt, sig] = parts;

  if (!(await verifyPayload(secret, `${collectionId}.${emailPart}.${expiresAt}`, sig))) return null;
  if (collectionId !== expected.collectionId || !(Number(expiresAt) > expected.now)) return null;

  const email = decodeText(emailPart);
  return email && normalizeEmail(email) === email ? email : null;
}
