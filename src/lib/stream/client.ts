// Cloudflare Stream API (Phase 6). Stream only ever fetches the original from
// R2 itself (the copy API with a presigned GET), so no video bytes pass
// through the Worker. Everything here is a no-op notice until David has
// enabled Stream and set the secrets (task 6.1), the same as r2Configured().
import { parseStreamVideo, type StreamState } from "./webhook";
import { playerUrl, signPlaybackToken, thumbnailUrl } from "./token";

function cfg() {
  return {
    accountId: process.env.CF_STREAM_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "",
    apiToken: process.env.CF_STREAM_API_TOKEN || "",
    customerCode: process.env.CF_STREAM_CUSTOMER_CODE || "",
    signingKeyId: process.env.CF_STREAM_SIGNING_KEY_ID || "",
    signingJwk: process.env.CF_STREAM_SIGNING_JWK || "",
  };
}

// Uploading needs the API token; playback also needs the customer code and
// the signing key. Either half missing shows a notice, never an error page.
export function streamConfigured(): boolean {
  const c = cfg();
  return Boolean(c.accountId && c.apiToken);
}

export function playbackConfigured(): boolean {
  const c = cfg();
  return Boolean(c.customerCode && c.signingKeyId && c.signingJwk);
}

type ApiResult<T> = { success?: boolean; result?: T; errors?: { message?: string }[] };

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const c = cfg();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${c.accountId}/stream${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.apiToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as ApiResult<T>;
  if (!res.ok || json.success === false) {
    const msg = json.errors?.map((e) => e.message).filter(Boolean).join("; ");
    throw new Error(`Stream ${method} ${path.split("/")[1] || "/"} failed (${res.status})${msg ? `: ${msg.slice(0, 200)}` : ""}`);
  }
  return json.result as T;
}

// Asks Stream to fetch the original from `sourceUrl` (a presigned R2 GET)
// and transcode it. meta.asset_id ties the video back to our row in
// Stream's own dashboard.
export async function copyToStream(sourceUrl: string, assetId: string, name: string): Promise<StreamState> {
  const result = await api<{ uid?: string; requireSignedURLs?: boolean }>("POST", "/copy", {
    url: sourceUrl,
    requireSignedURLs: true,
    meta: { name: name.slice(0, 200), asset_id: assetId },
  });
  const state = parseStreamVideo(result);
  if (!state) throw new Error("Stream didn't return a video id");
  // Belt and braces: the copy docs don't list requireSignedURLs as an input,
  // so make sure it stuck. A video that plays without a token would be
  // open to anyone who learns its id.
  if (result.requireSignedURLs !== true) {
    await api("POST", `/${state.uid}`, { uid: state.uid, requireSignedURLs: true });
  }
  return state;
}

// null when Stream has no such video.
export async function getStreamVideo(uid: string): Promise<StreamState | null> {
  if (!/^[0-9a-f]{32}$/i.test(uid)) return null;
  try {
    return parseStreamVideo(await api<unknown>("GET", `/${uid}`));
  } catch (err) {
    if (err instanceof Error && /\(404\)/.test(err.message)) return null;
    throw err;
  }
}

// Already gone counts as deleted.
export async function deleteStreamVideo(uid: string): Promise<void> {
  if (!/^[0-9a-f]{32}$/i.test(uid)) return;
  try {
    await api("DELETE", `/${uid}`);
  } catch (err) {
    if (err instanceof Error && /\(404\)/.test(err.message)) return;
    throw err;
  }
}

export type Playback = { playerUrl: string; posterUrl: string };

// Only call this after the viewer's access to the gallery has been checked.
export async function playbackFor(uid: string): Promise<Playback | null> {
  if (!playbackConfigured()) return null;
  const c = cfg();
  const token = await signPlaybackToken({
    keyId: c.signingKeyId,
    jwkBase64: c.signingJwk,
    videoUid: uid,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  return { playerUrl: playerUrl(c.customerCode, token), posterUrl: thumbnailUrl(c.customerCode, token) };
}
