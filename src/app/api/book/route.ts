// Public booking (Phase 4.4). Nobody here is signed in, so it validates as
// hard as /api/inquire before touching the service-role client.
//
// Order matters: the time is held first (hold_booking, atomic, refuses any
// overlap), then the contact, project and invoice are created and linked to
// the hold, then the client is sent to /pay. If anything after the hold
// fails, the hold simply expires. The booking is confirmed only by the
// verified Stripe webhook (migration 0024 trigger), never here.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isRateLimited } from "@/lib/rate-limit";
import { insertDraftInvoice } from "@/app/admin/invoices/draft";
import type { SessionType } from "@/app/admin/session-types/types";
import { bookingRange, localDate } from "@/lib/booking/book";
import { bookableSlots } from "@/lib/booking/load";
import { BOOKING_HOLD_MINUTES } from "@/lib/booking/hold";

export const dynamic = "force-dynamic";

const MAX_NAME = 200;
const MAX_EMAIL = 200;
const MAX_PHONE = 50;
const MAX_NOTES = 2000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function str(raw: FormDataEntryValue | null, max: number): string | null {
  const v = raw ? String(raw).trim().slice(0, max) : "";
  return v.length > 0 ? v : null;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function back(request: NextRequest, slug: string, message: string) {
  const url = new URL(`/book/${SLUG.test(slug) ? slug : ""}`, request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const slug = str(formData.get("slug"), 100) ?? "";

  // Honeypot and rate limit: same quiet treatment as /api/inquire.
  if (str(formData.get("hp_note"), 200) || isRateLimited(`book:${clientIp(request)}`)) {
    return back(request, slug, "Something went wrong. Please try again in a few minutes.");
  }

  const name = str(formData.get("name"), MAX_NAME);
  if (!name) return back(request, slug, "Please enter your name.");
  const email = str(formData.get("email"), MAX_EMAIL)?.toLowerCase() ?? null;
  if (!email || !isValidEmail(email)) return back(request, slug, "Please enter a valid email address.");
  const phone = str(formData.get("phone"), MAX_PHONE);
  const notes = str(formData.get("notes"), MAX_NOTES);
  const startRaw = str(formData.get("start"), 40);
  const start = startRaw ? new Date(startRaw) : null;
  if (!start || Number.isNaN(start.getTime())) return back(request, slug, "Please pick a time.");

  const db = supabaseAdmin();
  const { data: typeRow, error: typeError } = await db
    .from("session_types")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (typeError) return back(request, slug, "Something went wrong. Please try again.");
  if (!typeRow) return back(request, slug, "That session isn't available.");
  const type = typeRow as SessionType;
  if (type.price_cents <= 0) return back(request, slug, "That session can't be booked online yet.");

  // The time must still be one we'd offer right now (availability, notice,
  // buffers, daily limit), checked against live bookings.
  const now = new Date();
  const dayStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const dayEnd = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const { slots, timeZone } = await bookableSlots(db, type, { start: dayStart, end: dayEnd }, now);
  if (!timeZone || !slots.some((s) => s.start.getTime() === start.getTime())) {
    return back(request, slug, "Sorry, that time was just taken. Please pick another.");
  }

  const range = bookingRange(type, start);
  const { data: bookingId, error: holdError } = await db.rpc("hold_booking", {
    p_session_type_id: type.id,
    p_starts_at: range.start.toISOString(),
    p_ends_at: range.end.toISOString(),
    p_blocked_from: range.blockedFrom.toISOString(),
    p_blocked_until: range.blockedUntil.toISOString(),
    p_timezone: timeZone,
    p_hold_until: new Date(now.getTime() + BOOKING_HOLD_MINUTES * 60_000).toISOString(),
    p_client_notes: notes,
  });
  if (holdError) return back(request, slug, "Something went wrong. Please try again.");
  if (!bookingId) return back(request, slug, "Sorry, that time was just taken. Please pick another.");

  let invoiceId: string;
  try {
    // Same person booking again keeps one contact.
    const { data: existing, error: findError } = await db
      .from("contacts")
      .select("id")
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .order("created_at", { ascending: true })
      .limit(1);
    if (findError) throw findError;
    let contactId = existing?.[0]?.id as string | undefined;
    if (!contactId) {
      const { data: contact, error: contactError } = await db
        .from("contacts")
        .insert({ name, email, phone, kind: "lead", source: "Online booking" })
        .select("id")
        .single();
      if (contactError || !contact) throw contactError ?? new Error("Contact insert failed");
      contactId = contact.id as string;
    }

    // New projects start in the first stage; payment moves them to Booked.
    const { data: stages, error: stagesError } = await db
      .from("project_stages")
      .select("id")
      .order("position", { ascending: true })
      .limit(1);
    if (stagesError) throw stagesError;
    const stageId = stages?.[0]?.id ?? null;
    const { data: project, error: projectError } = await db
      .from("projects")
      .insert({
        contact_id: contactId,
        stage_id: stageId,
        title: `${type.name} - ${name}`,
        type: type.name,
        event_date: localDate(range.start, timeZone),
        description: notes,
      })
      .select("id")
      .single();
    if (projectError || !project) throw projectError ?? new Error("Project insert failed");

    invoiceId = await insertDraftInvoice(
      db,
      { project_id: project.id, contact_id: contactId, currency: type.currency, tax_rate: 0, notes: null },
      [{ description: type.name, quantity: 1, unit_price_cents: type.price_cents }]
    );
    // Deposit now, balance on the session day (2.4 schedule).
    if (type.deposit_cents !== null && type.deposit_cents < type.price_cents) {
      const { error: scheduleError } = await db.from("invoice_installments").insert([
        { invoice_id: invoiceId, position: 0, label: "Deposit", amount_cents: type.deposit_cents, due_date: localDate(now, timeZone) },
        {
          invoice_id: invoiceId,
          position: 1,
          label: "Balance",
          amount_cents: type.price_cents - type.deposit_cents,
          due_date: localDate(range.start, timeZone),
        },
      ]);
      if (scheduleError) throw scheduleError;
    }
    const { error: sentError } = await db.from("invoices").update({ status: "sent" }).eq("id", invoiceId);
    if (sentError) throw sentError;

    const { error: linkError } = await db
      .from("bookings")
      .update({ contact_id: contactId, project_id: project.id, invoice_id: invoiceId })
      .eq("id", bookingId);
    if (linkError) throw linkError;
  } catch (err) {
    console.error("booking: follow-up after hold failed", bookingId, err);
    await db.from("bookings").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("id", bookingId);
    return back(request, slug, "Something went wrong. Please try again.");
  }

  return NextResponse.redirect(new URL(`/pay/${invoiceId}`, request.url), 303);
}
