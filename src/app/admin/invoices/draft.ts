// Server-side helper for creating a draft invoice from already-validated line
// items — used by quote acceptance (task 3.5). Deliberately NOT a "use server"
// module: nothing here should be callable directly from a browser, only from
// server actions that have done their own validation first.
//
// Same money rules as actions.ts's createInvoice: totals are computed here
// with computeInvoiceTotals, never passed in, and the status is always
// "draft" — nothing on this path can mark an invoice sent or paid.
import type { supabaseAdmin } from "@/lib/supabase";
import { computeInvoiceTotals, type LineItemInput } from "./money";

export async function insertDraftInvoice(
  db: ReturnType<typeof supabaseAdmin>,
  fields: {
    project_id: string;
    contact_id: string;
    currency: string;
    tax_rate: number;
    notes: string | null;
  },
  lineItems: LineItemInput[]
): Promise<string> {
  if (lineItems.length === 0) throw new Error("At least one line item is required");

  const totals = computeInvoiceTotals(lineItems, {
    discountType: "none",
    discountValue: 0,
    taxRate: fields.tax_rate,
  });

  const { data, error } = await db
    .from("invoices")
    .insert({
      ...fields,
      status: "draft",
      discount_type: "none",
      discount_value: 0,
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: itemsError } = await db.from("invoice_line_items").insert(
    lineItems.map((item, i) => ({
      invoice_id: data.id,
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      position: i,
    }))
  );
  if (itemsError) {
    // Don't leave a header-only invoice with totals but no line items behind.
    await db.from("invoices").delete().eq("id", data.id);
    throw itemsError;
  }

  return data.id;
}
