// E-signature helpers (Phase 3.2). No imports, so Node's test runner can load
// it directly. The database (migration 0020) is the real guard on who can sign
// what; these keep the inputs clean before they get there.

export const MAX_SIGNER_NAME = 200;
export const MAX_USER_AGENT = 500;
export const MAX_IP = 64;

const enc = new TextEncoder();

// Lowercase hex SHA-256 of a string's UTF-8 bytes, or of raw bytes. Matches
// Postgres' encode(sha256(convert_to(text, 'UTF8')), 'hex').
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

// A typed signature: collapse whitespace, strip control characters, require a
// real name (at least two letters). Returns null if it isn't usable.
export function cleanSignerName(raw: string): string | null {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length === 0 || name.length > MAX_SIGNER_NAME) return null;
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return null;
  return name;
}

// Header values are client-controlled; keep them printable and bounded.
export function cleanHeader(raw: string | null | undefined, max: number): string {
  const v = (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return (v || "unknown").slice(0, max);
}

// "October 13, 2026 at 9:41:07 PM UTC". Always UTC so the signed copy reads
// the same wherever it's opened.
export function formatSignedAt(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }).format(d);
  return `${date} at ${time} UTC`;
}
