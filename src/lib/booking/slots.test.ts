// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSlots, type SlotSessionType, type SlotWindow } from "./slots.ts";

const TYPE: SlotSessionType = {
  id: "type-a",
  duration_minutes: 60,
  min_notice_minutes: 0,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  max_bookings_per_day: null,
};

const LONG_AGO = new Date("2000-01-01T00:00:00Z");

function window(weekday: number, start: string, end: string, timezone = "America/Chicago", typeId: string | null = null): SlotWindow {
  return { weekday, start_time: start, end_time: end, timezone, session_type_id: typeId };
}

function range(start: string, end: string) {
  return { start: new Date(start), end: new Date(end) };
}

function starts(slots: { start: Date }[]): string[] {
  return slots.map((s) => s.start.toISOString());
}

function localHour(d: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(d));
}

// 2027-01-04 is a Monday; Chicago is UTC-6 (CST).
test("window produces back-to-back slots in UTC", () => {
  const slots = generateSlots(TYPE, [window(1, "09:00", "12:00:00")], [], range("2027-01-04T00:00Z", "2027-01-11T00:00Z"), LONG_AGO);
  assert.deepEqual(starts(slots), ["2027-01-04T15:00:00.000Z", "2027-01-04T16:00:00.000Z", "2027-01-04T17:00:00.000Z"]);
  assert.equal(slots[0].end.toISOString(), "2027-01-04T16:00:00.000Z");
});

test("a slot must fit inside the window", () => {
  const slots = generateSlots({ ...TYPE, duration_minutes: 90 }, [window(1, "09:00", "12:00")], [], range("2027-01-04T00:00Z", "2027-01-05T00:00Z"), LONG_AGO);
  assert.deepEqual(starts(slots), ["2027-01-04T15:00:00.000Z", "2027-01-04T16:30:00.000Z"]);
});

test("other timezones: Tokyo (no DST) and a date-line-crossing day", () => {
  // 09:00 Monday in Tokyo is 00:00Z Monday.
  const slots = generateSlots(TYPE, [window(1, "09:00", "10:00", "Asia/Tokyo")], [], range("2027-01-03T00:00Z", "2027-01-05T00:00Z"), LONG_AGO);
  assert.deepEqual(starts(slots), ["2027-01-04T00:00:00.000Z"]);

  // 08:00 Monday in Tokyo is 23:00Z Sunday.
  const early = generateSlots(TYPE, [window(1, "08:00", "09:00", "Asia/Tokyo")], [], range("2027-01-03T00:00Z", "2027-01-05T00:00Z"), LONG_AGO);
  assert.deepEqual(starts(early), ["2027-01-03T23:00:00.000Z"]);
});

// US DST 2027: starts Sun 2027-03-14, ends Sun 2027-11-07.
test("DST-crossing week keeps the same local time (spring forward)", () => {
  const windows = [0, 1, 2, 3, 4, 5, 6].map((d) => window(d, "09:00", "10:00"));
  const slots = generateSlots(TYPE, windows, [], range("2027-03-11T00:00Z", "2027-03-18T00:00Z"), LONG_AGO);
  assert.equal(slots.length, 7);
  for (const s of slots) assert.equal(localHour(s.start, "America/Chicago"), 9);
  assert.deepEqual(starts(slots).slice(2, 4), ["2027-03-13T15:00:00.000Z", "2027-03-14T14:00:00.000Z"]);
});

test("DST-crossing week keeps the same local time (fall back)", () => {
  const windows = [0, 1, 2, 3, 4, 5, 6].map((d) => window(d, "09:00", "10:00"));
  const slots = generateSlots(TYPE, windows, [], range("2027-11-04T00:00Z", "2027-11-11T00:00Z"), LONG_AGO);
  assert.equal(slots.length, 7);
  for (const s of slots) assert.equal(localHour(s.start, "America/Chicago"), 9);
  assert.deepEqual(starts(slots).slice(2, 4), ["2027-11-06T14:00:00.000Z", "2027-11-07T15:00:00.000Z"]);
});

test("skipped local times are never offered and slots keep real duration", () => {
  // 02:00-03:00 doesn't exist on 2027-03-14 in Chicago.
  const slots = generateSlots(TYPE, [window(0, "01:00", "04:00")], [], range("2027-03-14T00:00Z", "2027-03-15T00:00Z"), LONG_AGO);
  // 01:00 CST (07:00Z, ends 03:00 CDT) and 03:00 CDT (08:00Z, ends 04:00 CDT).
  assert.deepEqual(starts(slots), ["2027-03-14T07:00:00.000Z", "2027-03-14T08:00:00.000Z"]);
});

test("ambiguous fall-back times use the earlier instant", () => {
  // 01:00-02:00 happens twice on 2027-11-07 in Chicago.
  const slots = generateSlots(TYPE, [window(0, "00:00", "03:00")], [], range("2027-11-07T00:00Z", "2027-11-08T00:00Z"), LONG_AGO);
  // 00:00 CDT, 01:00 CDT, 02:00 CST; window ends 03:00 CST (09:00Z).
  assert.deepEqual(starts(slots), ["2027-11-07T05:00:00.000Z", "2027-11-07T06:00:00.000Z", "2027-11-07T08:00:00.000Z"]);
});

test("Southern-hemisphere DST (Sydney, starts 2027-10-03)", () => {
  const windows = [window(6, "09:00", "10:00", "Australia/Sydney"), window(0, "09:00", "10:00", "Australia/Sydney")];
  const slots = generateSlots(TYPE, windows, [], range("2027-10-01T00:00Z", "2027-10-04T00:00Z"), LONG_AGO);
  // Sat 09:00 AEST (UTC+10), Sun 09:00 AEDT (UTC+11).
  assert.deepEqual(starts(slots), ["2027-10-01T23:00:00.000Z", "2027-10-02T22:00:00.000Z"]);
});

test("min notice hides slots that start too soon", () => {
  const slots = generateSlots({ ...TYPE, min_notice_minutes: 60 }, [window(1, "09:00", "12:00")], [], range("2027-01-04T00:00Z", "2027-01-05T00:00Z"), new Date("2027-01-04T15:30Z"));
  assert.deepEqual(starts(slots), ["2027-01-04T17:00:00.000Z"]);
});

test("busy intervals block overlapping slots, including buffers", () => {
  const busy = [{ start: new Date("2027-01-04T16:00Z"), end: new Date("2027-01-04T17:00Z") }];
  const plain = generateSlots(TYPE, [window(1, "09:00", "12:00")], busy, range("2027-01-04T00:00Z", "2027-01-05T00:00Z"), LONG_AGO);
  assert.deepEqual(starts(plain), ["2027-01-04T15:00:00.000Z", "2027-01-04T17:00:00.000Z"]);

  const after = generateSlots({ ...TYPE, buffer_after_minutes: 30 }, [window(1, "09:00", "12:00")], busy, range("2027-01-04T00:00Z", "2027-01-05T00:00Z"), LONG_AGO);
  assert.deepEqual(starts(after), ["2027-01-04T17:00:00.000Z"]);

  const before = generateSlots({ ...TYPE, buffer_before_minutes: 30 }, [window(1, "09:00", "12:00")], busy, range("2027-01-04T00:00Z", "2027-01-05T00:00Z"), LONG_AGO);
  assert.deepEqual(starts(before), ["2027-01-04T15:00:00.000Z"]);
});

test("max bookings per day counts only this type, per local date", () => {
  const windows = [window(1, "09:00", "12:00"), window(2, "09:00", "10:00")];
  const r = range("2027-01-04T00:00Z", "2027-01-06T00:00Z");
  const limited = { ...TYPE, max_bookings_per_day: 1 };
  // Booked Monday 08:00-08:30 local (outside the window, still counts).
  const sameType = [{ start: new Date("2027-01-04T14:00Z"), end: new Date("2027-01-04T14:30Z"), session_type_id: "type-a" }];
  assert.deepEqual(starts(generateSlots(limited, windows, sameType, r, LONG_AGO)), ["2027-01-05T15:00:00.000Z"]);

  const otherType = [{ ...sameType[0], session_type_id: "type-b" }];
  assert.equal(generateSlots(limited, windows, otherType, r, LONG_AGO).length, 4);
});

test("windows scoped to another type are ignored; overlapping windows dedupe", () => {
  const windows = [window(1, "09:00", "11:00"), window(1, "10:00", "12:00", "America/Chicago", "type-a"), window(1, "13:00", "14:00", "America/Chicago", "type-b")];
  const slots = generateSlots(TYPE, windows, [], range("2027-01-04T00:00Z", "2027-01-05T00:00Z"), LONG_AGO);
  assert.deepEqual(starts(slots), ["2027-01-04T15:00:00.000Z", "2027-01-04T16:00:00.000Z", "2027-01-04T17:00:00.000Z"]);
});

test("custom step offers overlapping start options", () => {
  const slots = generateSlots(TYPE, [window(1, "09:00", "11:00")], [], range("2027-01-04T00:00Z", "2027-01-05T00:00Z"), LONG_AGO, 30);
  assert.deepEqual(starts(slots), ["2027-01-04T15:00:00.000Z", "2027-01-04T15:30:00.000Z", "2027-01-04T16:00:00.000Z"]);
});
