// Google Calendar helpers (Phase 4.5). Pure, no imports, so Node's test
// runner can load it; the DB- and network-backed half is client.ts.

// The narrowest scopes that do the job: add and remove events on calendars
// David owns, and read busy times (not event details) to block slots.
// openid + email only tell Settings which account is connected.
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export function authUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // offline + consent: Google only hands out a refresh token this way.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

// Google event ids may use a-v and 0-9. A booking's uuid without dashes is
// lowercase hex, which fits, so the event id is fixed per booking and a
// repeated push is refused by Google (409) instead of making a duplicate.
export function eventIdFor(bookingId: string): string {
  const id = bookingId.toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error("Bad booking id");
  return `proofer${id}`;
}

export type BookingForEvent = {
  id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  project_id: string | null;
  sessionName: string;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  notes: string | null;
};

// No attendees: adding the client would make Google email them, and
// Proofer already sends the confirmation.
export function eventBody(b: BookingForEvent, adminBaseUrl: string) {
  const lines = [
    b.clientName && `Client: ${b.clientName}`,
    b.clientEmail && `Email: ${b.clientEmail}`,
    b.clientPhone && `Phone: ${b.clientPhone}`,
    b.notes && `Notes: ${b.notes.slice(0, 1000)}`,
    b.project_id && `Project: ${adminBaseUrl.replace(/\/+$/, "")}/admin/projects/${b.project_id}`,
    "Booked online through Proofer.",
  ].filter(Boolean);
  return {
    id: eventIdFor(b.id),
    summary: `${b.sessionName}${b.clientName ? ` - ${b.clientName}` : ""}`.slice(0, 250),
    description: lines.join("\n"),
    start: { dateTime: new Date(b.starts_at).toISOString(), timeZone: b.timezone },
    end: { dateTime: new Date(b.ends_at).toISOString(), timeZone: b.timezone },
    transparency: "opaque",
    reminders: { useDefault: true },
  };
}

export type BusyTime = { start: Date; end: Date };

// Reads one calendar's busy list out of a freeBusy response. Throws if
// Google reports an error for that calendar, so the caller can decide.
export function parseFreeBusy(payload: unknown, calendarId: string): BusyTime[] {
  const cal = (payload as { calendars?: Record<string, { busy?: unknown; errors?: { reason?: string }[] }> })?.calendars?.[calendarId];
  if (!cal) throw new Error("Google didn't return that calendar");
  if (cal.errors && cal.errors.length > 0) throw new Error(`Google calendar error: ${cal.errors.map((e) => e.reason).join(", ")}`);
  const out: BusyTime[] = [];
  for (const b of Array.isArray(cal.busy) ? cal.busy : []) {
    const start = new Date((b as { start?: string }).start ?? "");
    const end = new Date((b as { end?: string }).end ?? "");
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) out.push({ start, end });
  }
  return out;
}

// The email inside the id_token Google's token endpoint returns. Read
// without verifying the signature: it came straight from Google over TLS in
// the code exchange, and it's only used as a label in Settings.
export function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.email === "string" ? json.email.slice(0, 254) : null;
  } catch {
    return null;
  }
}
