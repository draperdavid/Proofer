// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInvoiceTotals, computeSchedule, dollarsToCents, scheduleAmountCents } from "./money.ts";

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

// ---------------------------------------------------------------- 2.6 totals
const item = (quantity: number, unit_price_cents: number) => ({ description: "x", quantity, unit_price_cents });
const none = { discountType: "none" as const, discountValue: 0, taxRate: 0 };

test("totals: plain sum of lines, fractional quantities rounded per line", () => {
  assert.deepEqual(computeInvoiceTotals([item(1, 50000), item(2, 1250)], none), { subtotalCents: 52500, discountCents: 0, taxCents: 0, totalCents: 52500 });
  // 1.5 hours at $33.33 = $49.995 -> rounds to $50.00 on the line.
  assert.equal(computeInvoiceTotals([item(1.5, 3333)], none).subtotalCents, 5000);
});

test("totals: tax applies to the amount after the discount", () => {
  // The $192.60 staging invoice: $200, 10% off, 7% tax.
  assert.deepEqual(computeInvoiceTotals([item(1, 20000)], { discountType: "percent", discountValue: 10, taxRate: 7 }), {
    subtotalCents: 20000,
    discountCents: 2000,
    taxCents: 1260,
    totalCents: 19260,
  });
  // Flat $25 off $500 with 7% tax.
  assert.deepEqual(computeInvoiceTotals([item(1, 50000)], { discountType: "flat", discountValue: 25, taxRate: 7 }), {
    subtotalCents: 50000,
    discountCents: 2500,
    taxCents: 3325,
    totalCents: 50825,
  });
});

test("totals: discounts never go below zero or above the subtotal", () => {
  assert.equal(computeInvoiceTotals([item(1, 10000)], { discountType: "flat", discountValue: 250, taxRate: 7 }).totalCents, 0);
  assert.equal(computeInvoiceTotals([item(1, 10000)], { discountType: "percent", discountValue: 150, taxRate: 0 }).discountCents, 10000);
  assert.equal(computeInvoiceTotals([item(1, 10000)], { discountType: "flat", discountValue: -5, taxRate: 0 }).discountCents, 0);
});

test("totals: zero and empty invoices stay at zero, and negative tax is ignored", () => {
  assert.deepEqual(computeInvoiceTotals([], { discountType: "percent", discountValue: 10, taxRate: 7 }), { subtotalCents: 0, discountCents: 0, taxCents: 0, totalCents: 0 });
  assert.equal(computeInvoiceTotals([item(1, 10000)], { discountType: "none", discountValue: 0, taxRate: -7 }).taxCents, 0);
});

test("totals: half cents round consistently and the parts always add up", () => {
  for (const [price, disc, tax] of [[3333, 12.5, 7.25], [999, 33, 8.875], [1, 50, 50], [123456, 0.5, 6]] as const) {
    const t = computeInvoiceTotals([item(3, price)], { discountType: "percent", discountValue: disc, taxRate: tax });
    assert.equal(t.totalCents, t.subtotalCents - t.discountCents + t.taxCents);
    assert.ok(Number.isInteger(t.totalCents));
  }
});

test("dollarsToCents avoids float drift", () => {
  assert.equal(dollarsToCents(0.1 + 0.2), 30);
  assert.equal(dollarsToCents(192.6), 19260);
  assert.equal(dollarsToCents(1.005), 100); // binary 1.00499..., the cent stays put
});

test("a deposit schedule built from an invoice total adds back to that total exactly", () => {
  const total = computeInvoiceTotals([item(1, 20000)], { discountType: "percent", discountValue: 10, taxRate: 7 }).totalCents;
  const plan = computeSchedule(total, [
    { label: "Deposit", amount: "33%", due_date: null },
    { label: "Middle", amount: "$50", due_date: null },
    { label: "", amount: "", due_date: null },
  ]);
  assert.equal(plan.reduce((s, p) => s + p.amount_cents, 0), total);
});
