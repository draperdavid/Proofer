// Booking helpers (Phase 4.4). Pure, so the test runner can load them; the
// DB-backed loader is in load.ts.
//
// A booking blocks its session plus that session type's buffers. The same
// blocked range is what hold_booking() (migration 0024) checks for overlap,
// and what generateSlots receives as busy time, so the offered slots and the
// database agree on what conflicts.
import type { BusyInterval, SlotSessionType } from "./slots.ts";

const MINUTE = 60_000;

export type BookingRange = { start: Date; end: Date; blockedFrom: Date; blockedUntil: Date };

export function bookingRange(type: SlotSessionType, start: Date): BookingRange {
  const end = new Date(start.getTime() + type.duration_minutes * MINUTE);
  return {
    start,
    end,
    blockedFrom: new Date(start.getTime() - type.buffer_before_minutes * MINUTE),
    blockedUntil: new Date(end.getTime() + type.buffer_after_minutes * MINUTE),
  };
}

export type LiveBookingRow = {
  session_type_id: string;
  starts_at: string;
  blocked_from: string;
  blocked_until: string;
};

// Existing bookings as busy time for generateSlots. Each one blocks its own
// buffered range, and generateSlots then pads the new slot by the new type's
// buffers, so neither session's buffer is ever eaten. (The per-day spot limit
// counts each booking on the local day its blocked range starts, which only
// differs from its session day when a buffer crosses midnight.)
export function busyFromBookings(rows: LiveBookingRow[]): BusyInterval[] {
  return rows.map((r) => ({
    start: new Date(r.blocked_from),
    end: new Date(r.blocked_until),
    session_type_id: r.session_type_id,
  }));
}

// "Saturday, October 17 at 10:00 AM" in the booking's time zone.
export function formatSessionWhen(start: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(start);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(start);
  return `${day} at ${time}`;
}

// The calendar date of an instant in a time zone, as YYYY-MM-DD.
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}
