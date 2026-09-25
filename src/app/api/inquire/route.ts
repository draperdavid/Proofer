// Public inquiry intake (Phase 1.5). Nobody hitting this route has a Supabase
// session — there's no auth middleware ahead of it — so it validates harder
// than any other endpoint in Phase 1 before touching the service-role client.
// Honeypot fills and rate-limited callers get the same "success" redirect as a
// real submission, so a bot (or a script probing the limit) can't tell it was dropped.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_NAME = 200;
const MAX_EMAIL = 200;
const MAX_PHONE = 50;
const MAX_TYPE = 100;
const MAX_MESSAGE = 5000;

function str(raw: FormDataEntryValue | null, max: number): string | null {
  const v = raw ? String(raw).trim().slice(0, max) : "";
  return v.length > 0 ? v : null;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function redirectTo(request: NextRequest, kind: "success" | "error", message?: string) {
  const url = new URL("/inquire", request.url);
  url.searchParams.set(kind, message ?? "1");
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  // Honeypot: real visitors never see or fill this field (hidden via CSS on the form).
  if (str(formData.get("company"), 200)) {
    return redirectTo(request, "success");
  }

  if (isRateLimited(clientIp(request))) {
    return redirectTo(request, "success");
  }

  const name = str(formData.get("name"), MAX_NAME);
  if (!name) return redirectTo(request, "error", "Name is required.");

  const email = str(formData.get("email"), MAX_EMAIL);
  if (email && !isValidEmail(email)) {
    return redirectTo(request, "error", "That email address doesn't look right.");
  }

  const phone = str(formData.get("phone"), MAX_PHONE);
  const type = str(formData.get("type"), MAX_TYPE);
  const message = str(formData.get("message"), MAX_MESSAGE);
  const eventDateRaw = str(formData.get("event_date"), 10);
  const eventDate = eventDateRaw && isValidDate(eventDateRaw) ? eventDateRaw : null;

  try {
    const db = supabaseAdmin();

    const { data: contact, error: contactErr } = await db
      .from("contacts")
      .insert({ name, email, phone, kind: "lead", source: "Public inquiry form" })
      .select("id")
      .single();
    if (contactErr || !contact) throw contactErr ?? new Error("Contact insert failed");

    const { data: stages, error: stagesErr } = await db
      .from("project_stages")
      .select("id")
      .order("position", { ascending: true })
      .limit(1);
    if (stagesErr) throw stagesErr;
    const stageId = stages?.[0]?.id ?? null;

    const { count } = await db
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stageId);

    const { error: projectErr } = await db.from("projects").insert({
      contact_id: contact.id,
      stage_id: stageId,
      title: type ? `${type} inquiry - ${name}` : `Inquiry - ${name}`,
      type,
      event_date: eventDate,
      description: message,
      position: count ?? 0,
    });
    if (projectErr) throw projectErr;
  } catch {
    return redirectTo(request, "error", "Something went wrong. Please try again.");
  }

  return redirectTo(request, "success");
}
