// A package's price is computed with the same invoice math (money.ts) and the
// quote's tax rate, with no discount — so the total a client sees on
// /quote/[id] is exactly the total of the draft invoice acceptance creates.
import { computeInvoiceTotals, type InvoiceTotals } from "../invoices/money";
import type { QuotePackageLineItem } from "./types";

export function packageTotals(items: QuotePackageLineItem[], taxRate: number): InvoiceTotals {
  return computeInvoiceTotals(items, { discountType: "none", discountValue: 0, taxRate });
}
