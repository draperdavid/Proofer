// Cloudflare Stream webhook + video state (Phase 6.3). Pure, no imports, so
// Node's test runner can load it. Stream signs each notification with a
// "Webhook-Signature: time=<unix seconds>,sig1=<hex>" header, where sig1 is
// HMAC-SHA256 over "<time>.<raw body>" keyed with the secret Stream returned
// when the webhook was registered.

// Stream sends once processing finishes. A replay can only re-state what
// Stream already said about a video we know, but old deliveries are still
// refused so a captured request can't be reused later.
const TOLERANCE_SECONDS = 10 * 60;

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signStreamWebhook(secret: string, time: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${time}.${body}`)));
}

function parseHeader(header: string): { time?: string; sig1?: string } {
  const out: Record<string, string> = {};
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// True only for a correctly signed, recent delivery.
export async function verifyStreamWebhook(
  secret: string,
  header: string | null,
  body: string,
  nowSeconds: number
): Promise<boolean> {
  if (!secret || !header) return false;
  const { time, sig1 } = parseHeader(header);
  if (!time || !sig1 || !/^\d{1,12}$/.test(time) || !/^[0-9a-f]{64}$/i.test(sig1)) return false;
  if (Math.abs(nowSeconds - Number(time)) > TOLERANCE_SECONDS) return false;
  return constantTimeEqual(sig1.toLowerCase(), await signStreamWebhook(secret, time, body));
}

export type StreamStatus = "queued" | "processing" | "ready" | "error";

export type StreamState = {
  uid: string;
  status: StreamStatus;
  error: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
};

// Stream's own codes, in words David can act on.
const ERROR_TEXT: Record<string, string> = {
  ERR_NON_VIDEO: "Stream says this file isn't a video.",
  ERR_FETCH_ORIGIN_ERROR: "Stream couldn't fetch the file from storage. Retry the transcode.",
  ERR_MALFORMED_VIDEO: "The video file is damaged. Try exporting it again.",
  ERR_DURATION_TOO_SHORT: "The video is too short to play.",
  ERR_DURATION_EXCEED_CONSTRAINT: "The video is longer than Stream allows.",
};

function positive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

// Maps Stream's video object (webhook body, or `result` of GET video) to the
// columns we keep. null for anything without a usable uid.
export function parseStreamVideo(payload: unknown): StreamState | null {
  if (!payload || typeof payload !== "object") return null;
  const v = payload as {
    uid?: unknown;
    readyToStream?: unknown;
    status?: { state?: unknown; errorReasonCode?: unknown; errReasonCode?: unknown; errorReasonText?: unknown; errReasonText?: unknown };
    duration?: unknown;
    input?: { width?: unknown; height?: unknown };
  };
  if (typeof v.uid !== "string" || !/^[0-9a-f]{32}$/i.test(v.uid)) return null;

  const state = typeof v.status?.state === "string" ? v.status.state : "";
  let status: StreamStatus;
  if (state === "error") status = "error";
  else if (state === "ready" || v.readyToStream === true) status = "ready";
  else if (state === "inprogress") status = "processing";
  else status = "queued"; // pendingupload, downloading, queued

  let error: string | null = null;
  if (status === "error") {
    const code = v.status?.errorReasonCode ?? v.status?.errReasonCode;
    const text = v.status?.errorReasonText ?? v.status?.errReasonText;
    error =
      (typeof code === "string" && ERROR_TEXT[code]) ||
      (typeof text === "string" && text ? text.slice(0, 300) : null) ||
      "Stream couldn't process this video.";
  }

  return {
    uid: v.uid.toLowerCase(),
    status,
    error,
    durationSeconds: positive(v.duration),
    width: positive(v.input?.width),
    height: positive(v.input?.height),
  };
}

// "1:05:09", "4:07", "0:12"
export function formatDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
