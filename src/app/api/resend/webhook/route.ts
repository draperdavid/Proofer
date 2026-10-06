// Resend delivery webhook (Phase 8.4). Public endpoint, so nothing is trusted
// until the Svix signature checks out against RESEND_WEBHOOK_SECRET. It only
// ever updates rows for emails we sent (matched by Resend's id) and adds
// suppressions; it can't send anything.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";
import { mergeDeliveryStatus, parseDeliveryEvent, verifyWebhook, type DeliveryStatus } from "@/lib/email/webhook";

export async function POST(request: NextRequest) {
  const secret = env.resendWebhookSecret();
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const body = await request.text();
  const ok = await verifyWebhook(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body,
    Math.floor(Date.now() / 1000)
  );
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const event = parseDeliveryEvent(payload);
  // Events we don't track still get a 200, or Resend keeps retrying them.
  if (!event) return NextResponse.json({ ok: true, ignored: true });

  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from("email_log")
    .select("id, delivery_status")
    .eq("provider_id", event.emailId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });

  if (row) {
    const next = mergeDeliveryStatus((row.delivery_status as DeliveryStatus | null) ?? null, event.status);
    const { error: updErr } = await db
      .from("email_log")
      .update({
        delivery_status: next,
        delivery_detail: next === event.status ? event.detail : undefined,
        delivery_updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updErr) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  if (event.suppress && event.recipients.length > 0) {
    const reason = event.status === "complained" ? "complained" : "bounced";
    const { error: supErr } = await db.from("email_suppressions").upsert(
      event.recipients.map((email) => ({ email, reason, detail: event.detail, provider_id: event.emailId })),
      { onConflict: "email" }
    );
    if (supErr) return NextResponse.json({ error: "Suppression failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
