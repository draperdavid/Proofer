// Resend webhook handling (Phase 8.4). Pure, no imports, so Node's test
// runner can load it. Resend signs webhooks the Svix way: HMAC-SHA256 over
// "<svix-id>.<svix-timestamp>.<raw body>" with the base64 part of the
// "whsec_..." secret, sent as one or more "v1,<base64>" in svix-signature.

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signWebhook(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return bytesToBase64(sig);
}

// True only for a correctly signed, recent delivery. Old timestamps are
// refused so a captured request can't be replayed later.
export async function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds: number
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  let expected: string;
  try {
    expected = await signWebhook(secret, id, timestamp, body);
  } catch {
    return false; // malformed secret
  }
  return signature
    .split(" ")
    .map((part) => part.split(","))
    .some(([version, sig]) => version === "v1" && typeof sig === "string" && constantTimeEqual(sig, expected));
}

export type DeliveryStatus = "delivered" | "delayed" | "bounced" | "complained";

export type DeliveryEvent = {
  status: DeliveryStatus;
  emailId: string;
  recipients: string[];
  detail: string | null;
  // Only a permanent bounce or a spam complaint stops future sends.
  suppress: boolean;
};

// Maps a Resend event to what we record; null for events we don't track
// (sent, opened, clicked) or anything malformed.
export function parseDeliveryEvent(payload: unknown): DeliveryEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const { type, data } = payload as { type?: unknown; data?: unknown };
  if (typeof type !== "string" || !data || typeof data !== "object") return null;
  const d = data as { email_id?: unknown; to?: unknown; bounce?: unknown };
  if (typeof d.email_id !== "string" || !d.email_id) return null;
  const recipients = (Array.isArray(d.to) ? d.to : [d.to])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  switch (type) {
    case "email.delivered":
      return { status: "delivered", emailId: d.email_id, recipients, detail: null, suppress: false };
    case "email.delivery_delayed":
      return { status: "delayed", emailId: d.email_id, recipients, detail: null, suppress: false };
    case "email.complained":
      return { status: "complained", emailId: d.email_id, recipients, detail: "Marked as spam", suppress: true };
    case "email.bounced": {
      const b = (d.bounce && typeof d.bounce === "object" ? d.bounce : {}) as {
        type?: unknown;
        subType?: unknown;
        message?: unknown;
      };
      const kind = typeof b.type === "string" ? b.type : "";
      const message = typeof b.message === "string" ? b.message : "";
      const sub = typeof b.subType === "string" ? b.subType : "";
      const detail = [kind, sub, message].filter(Boolean).join(": ").slice(0, 500) || "Bounced";
      // Transient bounces (full mailbox, greylisting) aren't the address's
      // fault; anything not clearly transient is treated as permanent.
      return { status: "bounced", emailId: d.email_id, recipients, detail, suppress: !/transient/i.test(kind) };
    }
    default:
      return null;
  }
}

const RANK: Record<DeliveryStatus, number> = { delayed: 0, delivered: 1, bounced: 2, complained: 3 };

// Webhooks can arrive out of order; a late "delayed" must not overwrite a
// "bounced". Returns the status to store.
export function mergeDeliveryStatus(current: DeliveryStatus | null, incoming: DeliveryStatus): DeliveryStatus {
  if (!current) return incoming;
  return RANK[incoming] >= RANK[current] ? incoming : current;
}
