// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingRange, busyFromBookings, formatSessionWhen, localDate } from "./book.ts";
import { generateSlots, type SlotSessionType, type SlotWindow } from "./slots.ts";

const TYPE: SlotSessionType = {
  id: "t1",
  duration_minutes: 60,
  min_notice_minutes: 0,
  buffer_before_minutes: 15,
  buffer_after_minutes: 30,
  max_bookings_per_day: null,
};

test("bookingRange pads the session by its buffers", () => {
  const r = bookingRange(TYPE, new Date("2026-11-02T15:00:00Z"));
  assert.equal(r.end.toISOString(), "2026-11-02T16:00:00.000Z");
  assert.equal(r.blockedFrom.toISOString(), "2026-11-02T14:45:00.000Z");
  assert.equal(r.blockedUntil.toISOString(), "2026-11-02T16:30:00.000Z");
});

test("a booked slot and the slots its buffers touch are no longer offered", () => {
  // Monday Nov 2 2026, 9:00-14:00 Eastern (EST, UTC-5).
  const windows: SlotWindow[] = [{ weekday: 1, start_time: "09:00", end_time: "14:00", timezone: "America/New_York", session_type_id: null }];
  const range = { start: new Date("2026-11-02T00:00:00Z"), end: new Date("2026-11-03T00:00:00Z") };
  const now = new Date("2026-10-01T00:00:00Z");
  const before = generateSlots(TYPE, windows, [], range, now);
  assert.deepEqual(before.map((s) => s.start.toISOString().slice(11, 16)), ["14:00", "15:00", "16:00", "17:00", "18:00"]);

  const booked = bookingRange(TYPE, new Date("2026-11-02T16:00:00Z")); // 11:00 local
  const busy = busyFromBookings([
    { session_type_id: "t1", starts_at: booked.start.toISOString(), blocked_from: booked.blockedFrom.toISOString(), blocked_until: booked.blockedUntil.toISOString() },
  ]);
  const after = generateSlots(TYPE, windows, busy, range, now);
  // 10:00 ends 11:00 (+30 buffer) overlaps 10:45; 12:00 starts at 12:00 (-15) overlaps 12:30. Only 9:00 and 13:00 remain.
  assert.deepEqual(after.map((s) => s.start.toISOString().slice(11, 16)), ["14:00", "18:00"]);
});

test("formatSessionWhen and localDate use the booking's time zone", () => {
  const start = new Date("2026-10-17T14:00:00Z");
  assert.equal(formatSessionWhen(start, "America/New_York"), "Saturday, October 17 at 10:00 AM");
  assert.equal(localDate(new Date("2026-10-18T02:00:00Z"), "America/New_York"), "2026-10-17");
});
