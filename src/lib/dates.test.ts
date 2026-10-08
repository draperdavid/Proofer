// Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDay, todayISO } from "./dates.ts";

test("formatDay shows the exact calendar day, never the day before", () => {
  assert.equal(formatDay("2026-11-14"), "Nov 14, 2026");
  assert.equal(formatDay("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatDay("2026-12-31"), "Dec 31, 2026");
  assert.equal(formatDay("2026-11-14", false), "Nov 14");
});

test("formatDay ignores a time part and passes odd input through", () => {
  assert.equal(formatDay("2026-11-14T00:00:00Z"), "Nov 14, 2026");
  assert.equal(formatDay("TBD"), "TBD");
  assert.equal(formatDay("2026-13-05"), "2026-13-05");
});

test("todayISO is a plain YYYY-MM-DD string", () => {
  assert.equal(todayISO(new Date("2026-10-08T23:59:59Z")), "2026-10-08");
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});
