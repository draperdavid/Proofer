import type { DiscountType } from "./types";

// All money math happens here, in integer cents, so the server and the
// client-side live preview (line-items-editor.tsx) share one source of
// truth. The server always recomputes from raw line items + rates on save;
// it never trusts a total posted from the client.

export type LineItemInput = {
  description: string;
  quantity: number;
  unit_price_cents: number;
};

export type InvoiceTotals = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function computeInvoiceTotals(
  items: LineItemInput[],
  opts: { discountType: DiscountType; discountValue: number; taxRate: number }
): InvoiceTotals {
  const subtotalCents = items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unit_price_cents),
    0
  );

  let discountCents = 0;
  if (opts.discountType === "percent") {
    discountCents = Math.round(subtotalCents * (opts.discountValue / 100));
  } else if (opts.discountType === "flat") {
    discountCents = Math.round(opts.discountValue * 100);
  }
  discountCents = Math.max(0, Math.min(discountCents, subtotalCents));

  const taxableCents = subtotalCents - discountCents;
  const taxCents = Math.max(0, Math.round(taxableCents * (opts.taxRate / 100)));

  const totalCents = taxableCents + taxCents;

  return { subtotalCents, discountCents, taxCents, totalCents };
}

// Payment schedules (Phase 2.4). Each row but the last is a percent of the
// total ("30%") or a dollar amount ("150", "$150.00"); the last row is the
// balance, whatever is left. Rounding lands on the balance, so the rows
// always add up to the total exactly.
export type ScheduleRowInput = { label: string; amount: string; due_date: string | null };
export type InstallmentPlan = { label: string; amount_cents: number; due_date: string | null };

const PERCENT = /^\s*(\d{1,3}(?:\.\d{1,2})?)\s*%\s*$/;
const DOLLARS = /^\s*\$?\s*(\d{1,9}(?:\.\d{1,2})?)\s*$/;

export function scheduleAmountCents(totalCents: number, amount: string): number | null {
  const pct = PERCENT.exec(amount);
  if (pct) return Math.round(totalCents * (Number(pct[1]) / 100));
  const usd = DOLLARS.exec(amount);
  if (usd) return dollarsToCents(Number(usd[1]));
  return null;
}

export function computeSchedule(totalCents: number, rows: ScheduleRowInput[]): InstallmentPlan[] {
  if (rows.length < 2) throw new Error("A payment schedule needs at least two payments (for example a deposit and the balance)");
  if (totalCents <= 0) throw new Error("A payment schedule needs an invoice total above zero");

  const plan: InstallmentPlan[] = [];
  let allocated = 0;
  rows.forEach((row, i) => {
    const label = row.label.trim() || (i === 0 ? "Deposit" : i === rows.length - 1 ? "Balance" : `Payment ${i + 1}`);
    let cents: number;
    if (i === rows.length - 1) {
      cents = totalCents - allocated;
      if (cents <= 0) throw new Error("The earlier payments add up to the whole total, so there's no balance left");
    } else {
      const parsed = scheduleAmountCents(totalCents, row.amount);
      if (parsed === null) throw new Error(`"${label}": enter a percent like 30% or an amount like 150`);
      if (parsed <= 0) throw new Error(`"${label}" must be more than zero`);
      cents = parsed;
    }
    allocated += cents;
    plan.push({ label: label.slice(0, 80), amount_cents: cents, due_date: row.due_date || null });
  });
  return plan;
}
