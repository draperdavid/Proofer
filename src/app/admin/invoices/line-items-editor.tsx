"use client";

// Line item rows + discount/tax controls for the invoice builder. The totals
// shown here are a live preview only — computed with the same math the
// server uses (money.ts), but the server always recomputes from the
// `line_items_json` hidden field on submit rather than trusting anything
// calculated in the browser.
import { useState } from "react";
import { computeInvoiceTotals, formatCents } from "./money";
import type { DiscountType, InvoiceLineItem } from "./types";

type Row = { description: string; quantity: string; unit_price: string };

function toRows(items: InvoiceLineItem[]): Row[] {
  if (items.length === 0) return [{ description: "", quantity: "1", unit_price: "0" }];
  return items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unit_price: (item.unit_price_cents / 100).toFixed(2),
    }));
}

export function LineItemsEditor({
  items,
  discountType,
  discountValue,
  taxRate,
}: {
  items: InvoiceLineItem[];
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(items));
  const [discType, setDiscType] = useState<DiscountType>(discountType);
  const [discValue, setDiscValue] = useState(String(discountValue));
  const [tax, setTax] = useState(String(taxRate));

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { description: "", quantity: "1", unit_price: "0" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const previewItems = rows
    .filter((r) => r.description.trim().length > 0)
    .map((r) => ({
      description: r.description.trim(),
      quantity: Number(r.quantity) || 0,
      unit_price_cents: Math.round((Number(r.unit_price) || 0) * 100),
    }));

  const totals = computeInvoiceTotals(previewItems, {
    discountType: discType,
    discountValue: Number(discValue) || 0,
    taxRate: Number(tax) || 0,
  });

  const lineItemsJson = JSON.stringify(
    previewItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price_cents / 100,
    }))
  );

  return (
    <div>
      <input type="hidden" name="line_items_json" value={lineItemsJson} />

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) => updateRow(i, { description: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.quantity}
                  onChange={(e) => updateRow(i, { quantity: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.unit_price}
                  onChange={(e) => updateRow(i, { unit_price: e.target.value })}
                />
              </td>
              <td>
                {formatCents(Math.round((Number(row.quantity) || 0) * (Number(row.unit_price) || 0) * 100))}
              </td>
              <td>
                <button type="button" onClick={() => removeRow(i)} disabled={rows.length <= 1}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addRow}>
        + Add line item
      </button>

      <div>
        <label htmlFor="discount_type">Discount type</label>
        <select
          id="discount_type"
          name="discount_type"
          value={discType}
          onChange={(e) => setDiscType(e.target.value as DiscountType)}
        >
          <option value="none">None</option>
          <option value="percent">Percent</option>
          <option value="flat">Flat amount</option>
        </select>
      </div>
      <div>
        <label htmlFor="discount_value">
          Discount value {discType === "percent" ? "(%)" : discType === "flat" ? "($)" : ""}
        </label>
        <input
          id="discount_value"
          name="discount_value"
          type="number"
          step="0.01"
          min="0"
          value={discValue}
          onChange={(e) => setDiscValue(e.target.value)}
          disabled={discType === "none"}
        />
      </div>
      <div>
        <label htmlFor="tax_rate">Tax rate (%)</label>
        <input
          id="tax_rate"
          name="tax_rate"
          type="number"
          step="0.01"
          min="0"
          value={tax}
          onChange={(e) => setTax(e.target.value)}
        />
      </div>

      <table>
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td>{formatCents(totals.subtotalCents)}</td>
          </tr>
          <tr>
            <td>Discount</td>
            <td>-{formatCents(totals.discountCents)}</td>
          </tr>
          <tr>
            <td>Tax</td>
            <td>{formatCents(totals.taxCents)}</td>
          </tr>
          <tr>
            <td>
              <strong>Total</strong>
            </td>
            <td>
              <strong>{formatCents(totals.totalCents)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
