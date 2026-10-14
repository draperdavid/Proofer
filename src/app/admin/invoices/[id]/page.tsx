import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteInvoice, updateInvoice, updateInvoiceStatus } from "../actions";
import { LineItemsEditor } from "../line-items-editor";
import { formatCents } from "../money";
import { formatDateTime } from "@/lib/dates";
import type { Invoice, InvoiceLineItem, PaymentEvent, PaymentOutcome } from "../types";
import { ClientLink } from "@/app/admin/_components/client-link";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";

export const dynamic = "force-dynamic";

// Outcomes where money reached Stripe but the invoice couldn't take it.
const NEEDS_ATTENTION: Partial<Record<PaymentOutcome, string>> = {
  already_paid: "Paid again after this invoice was already paid. Refund the extra payment in Stripe.",
  not_payable: "Paid while this invoice wasn't sent (draft or void). Check it in Stripe.",
  amount_mismatch: "Stripe's amount didn't match this invoice's total, so it wasn't marked paid. Check it in Stripe.",
};

type InvoiceWithRelations = Invoice & {
  projects: { id: string; title: string } | null;
  contacts: { id: string; name: string } | null;
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [{ data, error }, { data: items, error: itemsError }, { data: eventRows, error: eventsError }] =
    await Promise.all([
      db.from("invoices").select("*, projects(id, title), contacts(id, name)").eq("id", id).single(),
      db.from("invoice_line_items").select("*").eq("invoice_id", id).order("position", { ascending: true }),
      db
        .from("payment_events")
        .select("id, stripe_event_id, type, livemode, amount_cents, currency, outcome, received_at")
        .eq("invoice_id", id)
        .order("received_at", { ascending: true }),
    ]);
  if (error || !data) notFound();
  if (itemsError) throw itemsError;
  // 42P01 = migration 0022 not run on this environment yet: no payment history.
  if (eventsError && eventsError.code !== "42P01") throw eventsError;
  const events = (eventRows ?? []) as PaymentEvent[];
  const alerts = events.filter((e) => NEEDS_ATTENTION[e.outcome]);

  const invoice = data as unknown as InvoiceWithRelations;
  const lineItems = (items ?? []) as InvoiceLineItem[];
  const editable = invoice.status !== "paid";

  const updateThisInvoice = updateInvoice.bind(null, invoice.id);
  const deleteThisInvoice = deleteInvoice.bind(null, invoice.id, invoice.project_id);
  const markSent = updateInvoiceStatus.bind(null, invoice.id, "sent");
  const markDraft = updateInvoiceStatus.bind(null, invoice.id, "draft");
  const markVoid = updateInvoiceStatus.bind(null, invoice.id, "void");

  return (
    <main>
      <h1>Invoice</h1>
      <p>
        {invoice.projects ? (
          <Link className="back" href={`/admin/projects/${invoice.projects.id}`}>← Back to {invoice.projects.title}</Link>
        ) : (
          <Link className="back" href="/admin/invoices">← Back to invoices</Link>
        )}
      </p>
      <p>
        Status: <strong>{invoice.status}</strong>
        {invoice.contacts ? ` · ${invoice.contacts.name}` : ""}
        {" · "}
        {formatCents(invoice.total_cents, invoice.currency)}
      </p>

      {invoice.status === "paid" && invoice.paid_at && (
        <p>
          Paid {formatCents(invoice.amount_paid_cents ?? 0, invoice.currency)} on{" "}
          {formatDateTime(invoice.paid_at)} via Stripe.
        </p>
      )}

      {alerts.map((e) => (
        <p key={e.id} className="err">
          <strong>Needs attention:</strong> {NEEDS_ATTENTION[e.outcome]} (Stripe event {e.stripe_event_id})
        </p>
      ))}

      {invoice.status === "sent" && (
        <p>
          Pay link: <ClientLink path={`/pay/${invoice.id}`} />
        </p>
      )}

      {editable && (
        <>
          <form action={updateThisInvoice}>
            <input type="hidden" name="project_id" value={invoice.project_id} />
            <input type="hidden" name="contact_id" value={invoice.contact_id} />
            <div>
              <label htmlFor="due_date">Due date</label>
              <input id="due_date" name="due_date" type="date" defaultValue={invoice.due_date ?? ""} />
            </div>
            <LineItemsEditor
              items={lineItems}
              discountType={invoice.discount_type}
              discountValue={invoice.discount_value}
              taxRate={invoice.tax_rate}
            />
            <div>
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" name="notes" defaultValue={invoice.notes ?? ""} />
            </div>
            <button type="submit">Save changes</button>
          </form>

          <form action={deleteThisInvoice}>
            <ConfirmButton message="Delete this invoice? This can't be undone.">Delete invoice</ConfirmButton>
          </form>
        </>
      )}

      {editable && (
        <>
          <h2>Status</h2>
          <form action={invoice.status === "draft" ? markSent : markDraft}>
            <button type="submit">{invoice.status === "draft" ? "Mark as sent and email client" : "Revert to draft"}</button>
          </form>
          {invoice.status !== "void" && (
            <form action={markVoid}>
              <button type="submit">Void invoice</button>
            </form>
          )}
        </>
      )}
      {events.length > 0 && (
        <>
          <h2>Payment history</h2>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Stripe event</th>
                <th>Amount</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{formatDateTime(e.received_at)}</td>
                  <td>
                    {e.type}
                    {e.livemode ? "" : " (test)"}
                  </td>
                  <td>{e.amount_cents === null ? "—" : formatCents(e.amount_cents, e.currency ?? invoice.currency)}</td>
                  <td>{e.outcome.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
