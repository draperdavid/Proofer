import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteInvoice, updateInvoice, updateInvoiceStatus } from "../actions";
import { LineItemsEditor } from "../line-items-editor";
import { formatCents } from "../money";
import { businessTodayISO, formatDateTime, formatDay } from "@/lib/dates";
import type { Invoice, InvoiceInstallment, InvoiceLineItem, PaymentEvent, PaymentOutcome } from "../types";
import { ClientLink } from "@/app/admin/_components/client-link";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";
import { isMissingTable } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

// Outcomes where money reached Stripe but the invoice couldn't take it.
const NEEDS_ATTENTION: Partial<Record<PaymentOutcome, string>> = {
  already_paid: "Paid again after this invoice was already paid. Refund the extra payment in Stripe.",
  not_payable:
    "A payment arrived that this invoice couldn't take (it wasn't sent, or the payment didn't match its schedule). Check it in Stripe.",
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
  const [
    { data, error },
    { data: items, error: itemsError },
    { data: eventRows, error: eventsError },
    { data: scheduleRows, error: scheduleError },
  ] = await Promise.all([
      db.from("invoices").select("*, projects(id, title), contacts(id, name)").eq("id", id).single(),
      db.from("invoice_line_items").select("*").eq("invoice_id", id).order("position", { ascending: true }),
      db
        .from("payment_events")
        .select("id, stripe_event_id, type, livemode, amount_cents, currency, outcome, received_at")
        .eq("invoice_id", id)
        .order("received_at", { ascending: true }),
      db.from("invoice_installments").select("*").eq("invoice_id", id).order("position", { ascending: true }),
    ]);
  if (error || !data) notFound();
  if (itemsError) throw itemsError;
  // Missing table = migration 0022 not run on this environment yet: no payment history.
  if (eventsError && !isMissingTable(eventsError)) throw eventsError;
  if (scheduleError && !isMissingTable(scheduleError)) throw scheduleError;
  const events = (eventRows ?? []) as PaymentEvent[];
  const installments = (scheduleRows ?? []) as InvoiceInstallment[];
  const partlyPaid = installments.some((i) => i.status === "paid");
  const alerts = events.filter((e) => NEEDS_ATTENTION[e.outcome]);

  const invoice = data as unknown as InvoiceWithRelations;
  const lineItems = (items ?? []) as InvoiceLineItem[];
  // Any payment freezes the invoice (enforced in the database too, 0022/0023).
  const editable = invoice.status !== "paid" && !partlyPaid;

  const updateThisInvoice = updateInvoice.bind(null, invoice.id);
  const deleteThisInvoice = deleteInvoice.bind(null, invoice.id, invoice.project_id);
  const markSent = updateInvoiceStatus.bind(null, invoice.id, "sent");
  const markDraft = updateInvoiceStatus.bind(null, invoice.id, "draft");
  const markVoid = updateInvoiceStatus.bind(null, invoice.id, "void");

  const overdue = invoice.status === "sent" && invoice.due_date !== null && invoice.due_date < businessTodayISO();
  const [tone, statusLabel] =
    invoice.status === "paid" ? ["green", "Paid"] : invoice.status === "void" ? ["grey", "Void"] : invoice.status === "draft" ? ["blue", "Draft"] : overdue || alerts.length > 0 ? ["red", overdue ? "Overdue" : "Unpaid"] : ["blue", "Unpaid"];

  return (
    <main className="fluid workspace">
      {invoice.projects ? (
        <Link className="back" href={`/admin/projects/${invoice.projects.id}`}>
          ← {invoice.projects.title}
        </Link>
      ) : (
        <Link className="back" href="/admin/invoices">
          ← Invoices
        </Link>
      )}
      <header className="ws-head">
        <h1>Invoice · {formatCents(invoice.total_cents, invoice.currency)}</h1>
        <div className="ws-meta">
          <span className={`st ${tone}`}>{statusLabel}</span>
          {invoice.contacts && <span>{invoice.contacts.name}</span>}
          <span>{invoice.due_date ? `Due ${formatDay(invoice.due_date)}` : "Due on receipt"}</span>
        </div>
      </header>

      {alerts.map((e) => (
        <p key={e.id} className="notice err">
          <strong>Needs attention:</strong> {NEEDS_ATTENTION[e.outcome]} (Stripe event {e.stripe_event_id})
        </p>
      ))}

      <div className="ws">
        <aside className="ws-side" aria-label="Summary">
          <dl className="ws-facts">
            <div>
              <dt>Client</dt>
              <dd>{invoice.contacts ? <Link href={`/admin/contacts/${invoice.contacts.id}`}>{invoice.contacts.name}</Link> : "None"}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd className="num">{formatCents(invoice.total_cents, invoice.currency)}</dd>
            </div>
            {invoice.status === "paid" && invoice.paid_at && (
              <div>
                <dt>Paid</dt>
                <dd className="num">
                  {formatCents(invoice.amount_paid_cents ?? 0, invoice.currency)}
                  <span className="sub">{formatDateTime(invoice.paid_at)}</span>
                </dd>
              </div>
            )}
          </dl>
          {invoice.status === "sent" && (
            <div className="ws-next">
              <span className="lbl">Client pay link</span>
              <ClientLink path={`/pay/${invoice.id}`} />
            </div>
          )}
          {editable && (
            <div className="ws-next">
              <span className="lbl">Status</span>
              <form action={invoice.status === "draft" ? markSent : markDraft}>
                <button type="submit" className={invoice.status === "draft" ? "primary" : undefined}>
                  {invoice.status === "draft" ? "Mark as sent and email client" : "Revert to draft"}
                </button>
              </form>
              {invoice.status !== "void" && (
                <form action={markVoid}>
                  <button type="submit" className="ghost">
                    Void invoice
                  </button>
                </form>
              )}
              <form action={deleteThisInvoice}>
                <ConfirmButton message="Delete this invoice? This can't be undone.">Delete invoice</ConfirmButton>
              </form>
            </div>
          )}
        </aside>

        <div className="ws-main">
          {editable ? (
            <section className="ws-sec">
              <h3>Line items</h3>
              <form action={updateThisInvoice}>
                <input type="hidden" name="project_id" value={invoice.project_id} />
                <input type="hidden" name="contact_id" value={invoice.contact_id} />
                <div>
                  <label htmlFor="due_date">Due date</label>
                  <input id="due_date" name="due_date" type="date" defaultValue={invoice.due_date ?? ""} />
                </div>
                <LineItemsEditor
                  items={lineItems}
                  schedule={installments}
                  discountType={invoice.discount_type}
                  discountValue={invoice.discount_value}
                  taxRate={invoice.tax_rate}
                />
                <div>
                  <label htmlFor="notes">Notes</label>
                  <textarea id="notes" name="notes" defaultValue={invoice.notes ?? ""} />
                </div>
                <button type="submit" className="primary">
                  Save changes
                </button>
              </form>
            </section>
          ) : (
            <section className="ws-sec">
              <h3>Line items</h3>
              <ul className="ws-rows">
                {lineItems.map((li) => (
                  <li key={li.id}>
                    <span className="grow">{li.description}</span>
                    <span className="muted small">
                      {li.quantity} × {formatCents(li.unit_price_cents, invoice.currency)}
                    </span>
                    <span className="small">{formatCents(Math.round(li.quantity * li.unit_price_cents), invoice.currency)}</span>
                  </li>
                ))}
              </ul>
              {invoice.notes && <p className="muted" style={{ marginTop: 12 }}>{invoice.notes}</p>}
            </section>
          )}

          {installments.length > 0 && !editable && (
            <section className="ws-sec">
              <h3>Payment schedule</h3>
              <ul className="ws-rows">
                {installments.map((i) => (
                  <li key={i.id}>
                    <span className={`st ${i.status === "paid" ? "green" : "blue"}`}>{i.status === "paid" ? "Paid" : "Unpaid"}</span>
                    <span className="grow">{i.label}</span>
                    <span className="muted small">{i.status === "paid" && i.paid_at ? formatDateTime(i.paid_at) : i.due_date ? `Due ${formatDay(i.due_date)}` : "On receipt"}</span>
                    <span className="small">{formatCents(i.amount_cents, invoice.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {events.length > 0 && (
            <section className="ws-sec">
              <h3>Payment history</h3>
              <ul className="ws-rows">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className={`st ${e.outcome === "paid" || e.outcome === "installment_paid" ? "green" : NEEDS_ATTENTION[e.outcome] ? "red" : "grey"}`}>
                      {e.outcome.replace(/_/g, " ")}
                    </span>
                    <span className="grow">
                      {e.type}
                      {e.livemode ? "" : " (test)"}
                    </span>
                    <span className="muted small">{formatDateTime(e.received_at)}</span>
                    <span className="small">{e.amount_cents === null ? "" : formatCents(e.amount_cents, e.currency ?? invoice.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
