"use client";

// Package rows (each with its own line items) for the quote builder. Mirrors
// the invoices line-items-editor pattern: totals here are a live preview only,
// and the structure is posted as a hidden `packages_json` field the server
// re-validates and recomputes from rather than trusting.
import { useState } from "react";
import { formatCents } from "../invoices/money";
import { packageTotals } from "./totals";
import type { QuotePackage } from "./types";

type ItemRow = { description: string; quantity: string; unit_price: string };
type PackageRow = { name: string; description: string; items: ItemRow[] };

const emptyItem = (): ItemRow => ({ description: "", quantity: "1", unit_price: "0" });
const emptyPackage = (): PackageRow => ({ name: "", description: "", items: [emptyItem()] });

function toRows(packages: QuotePackage[]): PackageRow[] {
  if (packages.length === 0) return [emptyPackage()];
  return packages
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      name: p.name,
      description: p.description ?? "",
      items:
        p.line_items.length > 0
          ? p.line_items.map((item) => ({
              description: item.description,
              quantity: String(item.quantity),
              unit_price: (item.unit_price_cents / 100).toFixed(2),
            }))
          : [emptyItem()],
    }));
}

function previewItems(items: ItemRow[]) {
  return items
    .filter((r) => r.description.trim().length > 0)
    .map((r) => ({
      description: r.description.trim(),
      quantity: Number(r.quantity) || 0,
      unit_price_cents: Math.round((Number(r.unit_price) || 0) * 100),
    }));
}

export function PackagesEditor({ packages, taxRate }: { packages: QuotePackage[]; taxRate: number }) {
  const [rows, setRows] = useState<PackageRow[]>(() => toRows(packages));
  const [tax, setTax] = useState(String(taxRate));

  function updatePackage(p: number, patch: Partial<PackageRow>) {
    setRows((prev) => prev.map((row, idx) => (idx === p ? { ...row, ...patch } : row)));
  }
  function updateItem(p: number, i: number, patch: Partial<ItemRow>) {
    setRows((prev) =>
      prev.map((row, idx) =>
        idx === p
          ? { ...row, items: row.items.map((item, j) => (j === i ? { ...item, ...patch } : item)) }
          : row
      )
    );
  }
  function addItem(p: number) {
    setRows((prev) => prev.map((row, idx) => (idx === p ? { ...row, items: [...row.items, emptyItem()] } : row)));
  }
  function removeItem(p: number, i: number) {
    setRows((prev) =>
      prev.map((row, idx) =>
        idx === p && row.items.length > 1 ? { ...row, items: row.items.filter((_, j) => j !== i) } : row
      )
    );
  }
  function addPackage() {
    setRows((prev) => [...prev, emptyPackage()]);
  }
  function removePackage(p: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== p) : prev));
  }

  const taxNum = Number(tax) || 0;

  const packagesJson = JSON.stringify(
    rows
      .filter((row) => row.name.trim().length > 0)
      .map((row) => ({
        name: row.name.trim(),
        description: row.description.trim(),
        line_items: previewItems(row.items).map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price_cents / 100,
        })),
      }))
  );

  return (
    <div>
      <input type="hidden" name="packages_json" value={packagesJson} />

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

      {rows.map((row, p) => {
        const totals = packageTotals(previewItems(row.items), taxNum);
        return (
          <fieldset key={p}>
            <legend>Package {p + 1}</legend>
            <div>
              <label>
                Name{" "}
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updatePackage(p, { name: e.target.value })}
                />
              </label>
            </div>
            <div>
              <label>
                Description{" "}
                <textarea
                  value={row.description}
                  onChange={(e) => updatePackage(p, { description: e.target.value })}
                />
              </label>
            </div>

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
                {row.items.map((item, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(p, i, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.quantity}
                        onChange={(e) => updateItem(p, i, { quantity: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) => updateItem(p, i, { unit_price: e.target.value })}
                      />
                    </td>
                    <td>
                      {formatCents(
                        Math.round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100)
                      )}
                    </td>
                    <td>
                      <button type="button" onClick={() => removeItem(p, i)} disabled={row.items.length <= 1}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => addItem(p)}>
              + Add line item
            </button>

            <p>
              Subtotal {formatCents(totals.subtotalCents)} · Tax {formatCents(totals.taxCents)} ·{" "}
              <strong>Total {formatCents(totals.totalCents)}</strong>
            </p>

            <button type="button" onClick={() => removePackage(p)} disabled={rows.length <= 1}>
              Remove package
            </button>
          </fieldset>
        );
      })}
      <button type="button" onClick={addPackage}>
        + Add package
      </button>
    </div>
  );
}
