// Public invoice payment page — no auth, reached via a link David sends the
// client. Reads through supabaseAdmin() (service-role) same as /inquire in
// Phase 1.5: safe because this runs server-side only, never exposing the
// service-role key to the browser.
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { formatCents } from "@/app/admin/invoices/money";
import type { Invoice, InvoiceInstallment, InvoiceLineItem } from "@/app/admin/invoices/types";
import { formatDay } from "@/lib/dates";
import { createCheckoutSession } from "./actions";
import { isMissingTable } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

type InvoiceWithProject = Invoice & { projects: { title: string } | null };

export default async function PayInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [{ data, error }, { data: items, error: itemsError }, { data: scheduleRows, error: scheduleError }] =
    await Promise.all([
      db.from("invoices").select("*, projects(title)").eq("id", id).single(),
      db.from("invoice_line_items").select("*").eq("invoice_id", id).order("position", { ascending: true }),
      db.from("invoice_installments").select("*").eq("invoice_id", id).order("position", { ascending: true }),
    ]);
  if (error || !data) notFound();
  if (itemsError) throw itemsError;
  // Missing table = migration 0023 not run here yet: no schedules exist.
  if (scheduleError && !isMissingTable(scheduleError)) throw scheduleError;
  const installments = (scheduleRows ?? []) as InvoiceInstallment[];
  const next = installments.find((i) => i.status === "unpaid") ?? null;

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

      {installments.length > 0 && (
        <>
          <h2>Payment schedule</h2>
          <table>
            <thead>
              <tr>
                <th>Payment</th>
                <th>Due</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {installments.map((i) => (
                <tr key={i.id}>
                  <td>{i.label}</td>
                  <td>{i.due_date ? formatDay(i.due_date) : "—"}</td>
                  <td>{formatCents(i.amount_cents, invoice.currency)}</td>
                  <td>{i.status === "paid" ? "Paid" : i.id === next?.id ? "Due next" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {invoice.status === "paid" && <p>This invoice has already been paid. Thank you.</p>}
      {invoice.status === "void" && <p>This invoice has been voided.</p>}
      {invoice.status === "draft" && <p>This invoice isn&apos;t ready to be paid yet.</p>}
      {invoice.status === "sent" && (
        <form action={payNow}>
          <button type="submit">
            {next ? `Pay ${next.label.toLowerCase()}: ${formatCents(next.amount_cents, invoice.currency)}` : "Pay now"}
          </button>
        </form>
      )}
    </main>
  );
}
