// Loads what slot generation needs for one session type: availability
// windows and the bookings that currently hold time (Phase 4.4). Used by the
// public booking page, the booking route's re-check, and the admin preview,
// so all three offer the same slots.
import type { supabaseAdmin } from "@/lib/supabase";
import type { SessionType } from "@/app/admin/session-types/types";
import { isMissingTable } from "@/lib/db-errors";
import { busyFromBookings, type LiveBookingRow } from "./book";
import { generateSlots, type Slot, type SlotWindow } from "./slots";
import { calendarBusy } from "@/lib/gcal/client";

type Db = ReturnType<typeof supabaseAdmin>;

export async function loadWindows(db: Db): Promise<SlotWindow[]> {
  const { data, error } = await db
    .from("availability_windows")
    .select("weekday, start_time, end_time, timezone, session_type_id")
    .order("weekday")
    .order("start_time");
  if (error) throw error;
  return (data ?? []) as SlotWindow[];
}

// Confirmed bookings and unexpired holds overlapping [from, until).
export async function loadLiveBookings(db: Db, from: Date, until: Date): Promise<LiveBookingRow[]> {
  const { data, error } = await db
    .from("bookings")
    .select("session_type_id, starts_at, blocked_from, blocked_until, status, hold_expires_at")
    .in("status", ["confirmed", "pending_payment"])
    .lt("blocked_from", until.toISOString())
    .gt("blocked_until", from.toISOString());
  // Bookings table not migrated yet (0024): nothing is booked.
  if (isMissingTable(error)) return [];
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).filter(
    (b) => b.status === "confirmed" || new Date(b.hold_expires_at as string).getTime() > now
  ) as LiveBookingRow[];
}

// The time zone a type's slots are shown in: its own window's, else any.
export function displayZone(type: Pick<SessionType, "id">, windows: SlotWindow[]): string | null {
  return (windows.find((w) => w.session_type_id === type.id) ?? windows.find((w) => w.session_type_id === null) ?? windows[0])?.timezone ?? null;
}

export async function bookableSlots(
  db: Db,
  type: SessionType,
  range: { start: Date; end: Date },
  now: Date,
  windows?: SlotWindow[]
): Promise<{ slots: Slot[]; timeZone: string | null }> {
  const w = windows ?? (await loadWindows(db));
  // Pad by a day so bookings whose buffers reach into the range still count,
  // and so the per-day limit sees the whole first and last day.
  const DAY = 24 * 60 * 60 * 1000;
  const from = new Date(range.start.getTime() - DAY);
  const until = new Date(range.end.getTime() + DAY);
  // David's own Google Calendar counts as busy too (4.5). The booking route
  // calls this again at the moment of booking, so the calendar is re-checked
  // right before a time is held.
  const [live, calendar] = await Promise.all([loadLiveBookings(db, from, until), calendarBusy(from, until)]);
  const busy = [...busyFromBookings(live), ...calendar];
  return { slots: generateSlots(type, w, busy, range, now), timeZone: displayZone(type, w) };
}
