// Public invoice payment page — no auth, reached via a link David sends the
// client. Reads through supabaseAdmin() (service-role) same as /inquire in
// Phase 1.5: safe because this runs server-side only, never exposing the
// service-role key to the browser.
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { formatCents } from "@/app/admin/invoices/money";
import type { Invoice, InvoiceLineItem } from "@/app/admin/invoices/types";
import { createCheckoutSession } from "./actions";

export const dynamic = "force-dynamic";

type InvoiceWithProject = Invoice & { projects: { title: string } | null };

export default async function PayInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [{ data, error }, { data: items, error: itemsError }] = await Promise.all([
    db.from("invoices").select("*, projects(title)").eq("id", id).single(),
    db.from("invoice_line_items").select("*").eq("invoice_id", id).order("position", { ascending: true }),
  ]);
  if (error || !data) notFound();
  if (itemsError) throw itemsError;

  const invoice = data as unknown as InvoiceWithProject;
  const lineItems = (items ?? []) as InvoiceLineItem[];
  const payNow = createCheckoutSession.bind(null, invoice.id);

  return (
    <main>
      <h1>{invoice.projects?.title ?? "Invoice"}</h1>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => (
            <tr key={item.id}>
              <td>{item.description}</td>
              <td>{item.quantity}</td>
              <td>{formatCents(item.unit_price_cents, invoice.currency)}</td>
              <td>{formatCents(Math.round(item.quantity * item.unit_price_cents), invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table>
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td>{formatCents(invoice.subtotal_cents, invoice.currency)}</td>
          </tr>
          <tr>
            <td>Discount</td>
            <td>-{formatCents(invoice.discount_cents, invoice.currency)}</td>
          </tr>
          <tr>
            <td>Tax</td>
            <td>{formatCents(invoice.tax_cents, invoice.currency)}</td>
          </tr>
          <tr>
            <td>
              <strong>Total</strong>
            </td>
            <td>
              <strong>{formatCents(invoice.total_cents, invoice.currency)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {invoice.status === "paid" && <p>This invoice has already been paid. Thank you.</p>}
      {invoice.status === "void" && <p>This invoice has been voided.</p>}
      {invoice.status === "draft" && <p>This invoice isn&apos;t ready to be paid yet.</p>}
      {invoice.status === "sent" && (
        <form action={payNow}>
          <button type="submit">Pay now</button>
        </form>
      )}
    </main>
  );
}
