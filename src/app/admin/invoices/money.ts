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
