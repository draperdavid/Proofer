// Google Calendar, the network half (Phase 4.5). Two directions:
//   - out: confirmed bookings become events on David's calendar;
//   - in: his calendar's busy times are blocked from the booking slots,
//     including a fresh check at the moment a client books.
// Before GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET exist (task 4.1) or before
// David connects his account, all of this quietly does nothing.
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTable } from "@/lib/db-errors";
import { eventBody, eventIdFor, parseFreeBusy, type BookingForEvent, type BusyTime } from "./google";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(): string {
  return `${(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "")}/admin/calendar/callback`;
}

type Link = {
  account_email: string | null;
  calendar_id: string;
  refresh_token: string | null;
  access_token: string | null;
  access_expires_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  connected_at: string | null;
};

export async function getLink(): Promise<Link | null> {
  const { data, error } = await supabaseAdmin().from("google_calendar").select("*").eq("id", 1).maybeSingle();
  if (isMissingTable(error)) return null; // before migration 0030
  if (error) throw error;
  return (data as Link | null) ?? null;
}

export async function recordError(message: string) {
  await supabaseAdmin()
    .from("google_calendar")
    .update({ last_error: message.slice(0, 500), last_error_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", 1);
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...params,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
}

// The code-exchange half of connecting (the callback route).
export async function exchangeCode(code: string) {
  const { ok, json } = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!ok || typeof json.access_token !== "string") {
    throw new Error(`Google refused the sign-in (${String(json.error ?? "unknown")})`);
  }
  return json as { access_token: string; expires_in?: number; refresh_token?: string; id_token?: string; scope?: string };
}

// A working access token, refreshed when the stored one is about to expire.
// null when not connected. If Google has revoked access, the link is
// cleared so Settings shows "Connect" again.
async function accessToken(link: Link): Promise<string | null> {
  if (!googleConfigured() || !link.refresh_token) return null;
  const exp = link.access_expires_at ? new Date(link.access_expires_at).getTime() : 0;
  if (link.access_token && exp - Date.now() > 2 * 60_000) return link.access_token;

  const { ok, json } = await tokenRequest({ refresh_token: link.refresh_token, grant_type: "refresh_token" });
  const db = supabaseAdmin();
  if (!ok || typeof json.access_token !== "string") {
    if (json.error === "invalid_grant") {
      await db
        .from("google_calendar")
        .update({
          refresh_token: null,
          access_token: null,
          access_expires_at: null,
          last_error: "Google disconnected Proofer (access was revoked or expired). Connect again in Settings.",
          last_error_at: new Date().toISOString(),
        })
        .eq("id", 1);
      return null;
    }
    throw new Error(`Google token refresh failed (${String(json.error ?? "unknown")})`);
  }
  const expiresAt = new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000).toISOString();
  await db.from("google_calendar").update({ access_token: json.access_token, access_expires_at: expiresAt }).eq("id", 1);
  return json.access_token;
}

async function gapi(token: string, method: string, path: string, body?: unknown) {
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Busy times on David's calendar in [from, until). Returns [] when not
// connected. If Google can't be reached, slots are still offered (logged and
// shown in Settings): a booking page that goes dark whenever Google hiccups
// costs more than the rare clash with a personal event. The database still
// refuses any clash between two bookings.
export async function calendarBusy(from: Date, until: Date): Promise<BusyTime[]> {
  try {
    const link = await getLink();
    if (!link) return [];
    const token = await accessToken(link);
    if (!token) return [];
    const res = await gapi(token, "POST", "/freeBusy", {
      timeMin: from.toISOString(),
      timeMax: until.toISOString(),
      items: [{ id: link.calendar_id }],
    });
    if (!res.ok) throw new Error(`Google free/busy failed (${res.status})`);
    return parseFreeBusy(await res.json(), link.calendar_id);
  } catch (err) {
    console.error("calendar busy check failed", err);
    await recordError(`Couldn't read busy times: ${err instanceof Error ? err.message : "unknown error"}`).catch(() => {});
    return [];
  }
}

type BookingRow = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  project_id: string | null;
  client_notes: string | null;
  calendar_event_id: string | null;
  session_types: { name: string } | null;
  contacts: { name: string; email: string | null; phone: string | null } | null;
};

const BOOKING_SELECT =
  "id, status, starts_at, ends_at, timezone, project_id, client_notes, calendar_event_id, session_types(name), contacts(name, email, phone)";

// Puts a confirmed booking on the calendar, or takes a canceled one off.
// Safe to call again: the event id is fixed per booking. Returns false when
// Google isn't connected (the hourly job retries later).
export async function syncBooking(bookingId: string): Promise<boolean> {
  const link = await getLink();
  if (!link) return false;
  const token = await accessToken(link);
  if (!token) return false;

  const db = supabaseAdmin();
  const { data, error } = await db.from("bookings").select(BOOKING_SELECT).eq("id", bookingId).single();
  if (error) throw error;
  const b = data as unknown as BookingRow;
  const cal = encodeURIComponent(link.calendar_id);

  if (b.status === "confirmed" && !b.calendar_event_id) {
    const event: BookingForEvent = {
      id: b.id,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      timezone: b.timezone,
      project_id: b.project_id,
      sessionName: b.session_types?.name ?? "Session",
      clientName: b.contacts?.name ?? null,
      clientEmail: b.contacts?.email ?? null,
      clientPhone: b.contacts?.phone ?? null,
      notes: b.client_notes,
    };
    const res = await gapi(token, "POST", `/calendars/${cal}/events`, eventBody(event, process.env.APP_BASE_URL || ""));
    // 409: already there from an earlier try.
    if (!res.ok && res.status !== 409) throw new Error(`Google event create failed (${res.status})`);
    const { error: upd } = await db
      .from("bookings")
      .update({ calendar_event_id: eventIdFor(b.id), calendar_synced_at: new Date().toISOString() })
      .eq("id", b.id);
    if (upd) throw upd;
  } else if (b.status === "canceled" && b.calendar_event_id) {
    const res = await gapi(token, "DELETE", `/calendars/${cal}/events/${encodeURIComponent(b.calendar_event_id)}`);
    // 404/410: already gone.
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google event delete failed (${res.status})`);
    const { error: upd } = await db
      .from("bookings")
      .update({ calendar_event_id: null, calendar_synced_at: new Date().toISOString() })
      .eq("id", b.id);
    if (upd) throw upd;
  }
  return true;
}

// Never throws: used right after a payment or a cancel, where a calendar
// problem must not undo or fail the real change. The hourly job retries.
export async function syncBookingQuietly(bookingId: string): Promise<void> {
  try {
    await syncBooking(bookingId);
  } catch (err) {
    console.error("calendar sync failed", bookingId, err);
    await recordError(`Couldn't update the calendar: ${err instanceof Error ? err.message : "unknown error"}`).catch(() => {});
  }
}

// The hourly catch-up: confirmed upcoming bookings not on the calendar yet,
// and canceled ones still on it. A few per run (Workers cap subrequests).
export async function syncPendingBookings(limit = 10): Promise<{ synced: number }> {
  if (!googleConfigured()) return { synced: 0 };
  const link = await getLink();
  if (!link?.refresh_token) return { synced: 0 };
  const { data, error } = await supabaseAdmin()
    .from("bookings")
    .select("id")
    .or("and(status.eq.confirmed,calendar_event_id.is.null),and(status.eq.canceled,calendar_event_id.not.is.null)")
    .gt("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(limit);
  if (isMissingTable(error)) return { synced: 0 };
  if (error) throw error;
  let synced = 0;
  for (const row of data ?? []) {
    try {
      if (await syncBooking(row.id as string)) synced++;
    } catch (err) {
      console.error("calendar catch-up failed", row.id, err);
      await recordError(`Couldn't update the calendar: ${err instanceof Error ? err.message : "unknown error"}`).catch(() => {});
    }
  }
  return { synced };
}
