// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSchedule, scheduleAmountCents } from "./money.ts";

const sum = (plan: { amount_cents: number }[]) => plan.reduce((s, p) => s + p.amount_cents, 0);

test("scheduleAmountCents reads percents and dollar amounts", () => {
  assert.equal(scheduleAmountCents(53500, "30%"), 16050);
  assert.equal(scheduleAmountCents(53500, " 12.5 % "), 6688);
  assert.equal(scheduleAmountCents(53500, "150"), 15000);
  assert.equal(scheduleAmountCents(53500, "$150.25"), 15025);
  assert.equal(scheduleAmountCents(53500, "abc"), null);
  assert.equal(scheduleAmountCents(53500, "-5"), null);
  assert.equal(scheduleAmountCents(53500, "1.234"), null);
  assert.equal(scheduleAmountCents(53500, ""), null);
});

test("deposit + balance adds up to the total exactly", () => {
  const plan = computeSchedule(53500, [
    { label: "Retainer", amount: "30%", due_date: "2026-10-20" },
    { label: "", amount: "", due_date: "2026-11-14" },
  ]);
  assert.deepEqual(plan, [
    { label: "Retainer", amount_cents: 16050, due_date: "2026-10-20" },
    { label: "Balance", amount_cents: 37450, due_date: "2026-11-14" },
  ]);
  assert.equal(sum(plan), 53500);
});

test("rounding always lands on the balance", () => {
  const plan = computeSchedule(10001, [
    { label: "", amount: "33.33%", due_date: null },
    { label: "", amount: "33.33%", due_date: null },
    { label: "", amount: "", due_date: null },
  ]);
  assert.deepEqual(
    plan.map((p) => p.label),
    ["Deposit", "Payment 2", "Balance"]
  );
  assert.equal(sum(plan), 10001);
  assert.ok(plan.every((p) => p.amount_cents > 0));
});

test("the balance ignores whatever amount is typed on the last row", () => {
  const plan = computeSchedule(20000, [
    { label: "Deposit", amount: "50", due_date: null },
    { label: "Balance", amount: "999999", due_date: null },
  ]);
  assert.equal(plan[1].amount_cents, 15000);
});

test("refuses schedules that can't be paid", () => {
  assert.throws(() => computeSchedule(20000, [{ label: "", amount: "", due_date: null }]), /at least two/);
  assert.throws(
    () => computeSchedule(0, [{ label: "", amount: "10%", due_date: null }, { label: "", amount: "", due_date: null }]),
    /above zero/
  );
  assert.throws(
    () => computeSchedule(20000, [{ label: "", amount: "100%", due_date: null }, { label: "", amount: "", due_date: null }]),
    /no balance left/
  );
  assert.throws(
    () => computeSchedule(20000, [{ label: "", amount: "250", due_date: null }, { label: "", amount: "", due_date: null }]),
    /no balance left/
  );
  assert.throws(
    () => computeSchedule(20000, [{ label: "", amount: "0", due_date: null }, { label: "", amount: "", due_date: null }]),
    /more than zero/
  );
  assert.throws(
    () => computeSchedule(20000, [{ label: "", amount: "half", due_date: null }, { label: "", amount: "", due_date: null }]),
    /percent like 30%/
  );
});

test("empty due dates are stored as null and long labels are trimmed", () => {
  const plan = computeSchedule(20000, [
    { label: "x".repeat(200), amount: "10%", due_date: "" },
    { label: "", amount: "", due_date: null },
  ]);
  assert.equal(plan[0].due_date, null);
  assert.equal(plan[0].label.length, 80);
});
