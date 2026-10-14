"use client";

// Line item rows + discount/tax controls for the invoice builder. The totals
// shown here are a live preview only — computed with the same math the
// server uses (money.ts), but the server always recomputes from the
// `line_items_json` hidden field on submit rather than trusting anything
// calculated in the browser.
import { useState } from "react";
import { computeInvoiceTotals, computeSchedule, formatCents, type InstallmentPlan } from "./money";
import type { DiscountType, InvoiceInstallment, InvoiceLineItem } from "./types";

type Row = { description: string; quantity: string; unit_price: string };
type ScheduleRow = { label: string; amount: string; due_date: string };

const DEFAULT_SCHEDULE: ScheduleRow[] = [
  { label: "Deposit", amount: "30%", due_date: "" },
  { label: "Balance", amount: "", due_date: "" },
];

// Saved installments come back as dollar amounts; the balance row is implied.
function toScheduleRows(installments: InvoiceInstallment[]): ScheduleRow[] {
  return installments
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i, idx, all) => ({
      label: i.label,
      amount: idx === all.length - 1 ? "" : (i.amount_cents / 100).toFixed(2),
      due_date: i.due_date ?? "",
    }));
}

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
  schedule,
  discountType,
  discountValue,
  taxRate,
}: {
  items: InvoiceLineItem[];
  schedule: InvoiceInstallment[];
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(items));
  const [discType, setDiscType] = useState<DiscountType>(discountType);
  const [discValue, setDiscValue] = useState(String(discountValue));
  const [tax, setTax] = useState(String(taxRate));
  const [split, setSplit] = useState(schedule.length > 0);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>(() =>
    schedule.length > 0 ? toScheduleRows(schedule) : DEFAULT_SCHEDULE
  );

  function updateScheduleRow(i: number, patch: Partial<ScheduleRow>) {
    setScheduleRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addScheduleRow() {
    // New payments go before the balance, which always stays last.
    setScheduleRows((prev) => [...prev.slice(0, -1), { label: "", amount: "", due_date: "" }, prev[prev.length - 1]]);
  }
  function removeScheduleRow(i: number) {
    setScheduleRows((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  }

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

  // Same schedule math as the server, which recomputes it on save.
  let plan: InstallmentPlan[] = [];
  let scheduleError: string | null = null;
  if (split) {
    try {
      plan = computeSchedule(totals.totalCents, scheduleRows);
    } catch (e) {
      scheduleError = e instanceof Error ? e.message : "Invalid payment schedule";
    }
  }

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
      <input type="hidden" name="schedule_json" value={split ? JSON.stringify(scheduleRows) : ""} />

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

      <h2>Payment schedule</h2>
      <div>
        <label>
          <input type="radio" name="payment_plan" checked={!split} onChange={() => setSplit(false)} /> Pay in full
        </label>{" "}
        <label>
          <input type="radio" name="payment_plan" checked={split} onChange={() => setSplit(true)} /> Split into payments
        </label>
      </div>
      {split && (
        <>
          <table>
            <thead>
              <tr>
                <th>Payment</th>
                <th>Amount (30% or 150)</th>
                <th>Due date</th>
                <th>Comes to</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows.map((row, i) => {
                const isBalance = i === scheduleRows.length - 1;
                return (
                  <tr key={i}>
                    <td>
                      <input type="text" value={row.label} maxLength={80} onChange={(e) => updateScheduleRow(i, { label: e.target.value })} />
                    </td>
                    <td>
                      {isBalance ? (
                        "Whatever is left"
                      ) : (
                        <input type="text" value={row.amount} onChange={(e) => updateScheduleRow(i, { amount: e.target.value })} />
                      )}
                    </td>
                    <td>
                      <input type="date" value={row.due_date} onChange={(e) => updateScheduleRow(i, { due_date: e.target.value })} />
                    </td>
                    <td>{plan[i] ? formatCents(plan[i].amount_cents) : "—"}</td>
                    <td>
                      {!isBalance && (
                        <button type="button" onClick={() => removeScheduleRow(i)} disabled={scheduleRows.length <= 2}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" onClick={addScheduleRow} disabled={scheduleRows.length >= 12}>
            + Add payment
          </button>
          {scheduleError && <p className="err">{scheduleError}</p>}
        </>
      )}
    </div>
  );
}
