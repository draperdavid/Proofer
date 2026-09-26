import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteInvoice, updateInvoice, updateInvoiceStatus } from "../actions";
import { LineItemsEditor } from "../line-items-editor";
import { formatCents } from "../money";
import type { Invoice, InvoiceLineItem } from "../types";

export const dynamic = "force-dynamic";

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
  const [{ data, error }, { data: items, error: itemsError }] = await Promise.all([
    db.from("invoices").select("*, projects(id, title), contacts(id, name)").eq("id", id).single(),
    db.from("invoice_line_items").select("*").eq("invoice_id", id).order("position", { ascending: true }),
  ]);
  if (error || !data) notFound();
  if (itemsError) throw itemsError;

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
          <Link href={`/admin/projects/${invoice.projects.id}`}>Back to {invoice.projects.title}</Link>
        ) : (
          <Link href="/admin/invoices">Back to invoices</Link>
        )}
      </p>
      <p>
        Status: <strong>{invoice.status}</strong>
        {invoice.contacts ? ` · ${invoice.contacts.name}` : ""}
        {" · "}
        {formatCents(invoice.total_cents, invoice.currency)}
      </p>

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
            <button type="submit">Delete invoice</button>
          </form>
        </>
      )}

      {editable && (
        <>
          <h2>Status</h2>
          <form action={invoice.status === "draft" ? markSent : markDraft}>
            <button type="submit">{invoice.status === "draft" ? "Mark as sent" : "Revert to draft"}</button>
          </form>
          {invoice.status !== "void" && (
            <form action={markVoid}>
              <button type="submit">Void invoice</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
