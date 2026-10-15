// Authenticates the Worker's cron trigger to /api/cron/reminders (Phase 8.3).
// The token is an HMAC of a fixed label under the Supabase service-role key,
// which the Worker already holds, so no extra secret is needed: anyone who
// can compute it could already read and write the whole database. Pure
// WebCrypto, no imports: worker.mjs bundles this file directly.

export const CRON_HEADER = "x-proofer-cron";

const LABEL = "proofer-cron:reminders:v1";

export async function cronToken(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(LABEL)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyCronToken(secret: string, given: string): Promise<boolean> {
  const want = await cronToken(secret);
  if (given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
