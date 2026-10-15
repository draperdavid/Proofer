// Cloudflare Stream webhook (Phase 6.3). Public endpoint, so nothing is
// trusted until the Webhook-Signature checks out against
// CF_STREAM_WEBHOOK_SECRET. It only ever updates the status of a video we
// already know, matched by Stream's id; it can't create or delete anything.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseStreamVideo, verifyStreamWebhook } from "@/lib/stream/webhook";
import { applyStreamState } from "@/lib/stream/sync";

export async function POST(request: NextRequest) {
  const secret = process.env.CF_STREAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const body = await request.text();
  const ok = await verifyStreamWebhook(secret, request.headers.get("webhook-signature"), body, Math.floor(Date.now() / 1000));
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const state = parseStreamVideo(payload);
  // Videos we don't know (the other environment's, or deleted) still get a
  // 200 so Stream doesn't keep retrying them.
  if (!state) return NextResponse.json({ ok: true, ignored: true });

  try {
    const matched = await applyStreamState(state);
    return NextResponse.json({ ok: true, matched });
  } catch (err) {
    console.error("stream webhook update failed", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
