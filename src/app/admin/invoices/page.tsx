import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { formatCents } from "./money";
import type { InvoiceStatus } from "./types";

export const dynamic = "force-dynamic";

type SearchParams = { status?: string };

type InvoiceRow = {
  id: string;
  status: InvoiceStatus;
  total_cents: number;
  currency: string;
  due_date: string | null;
  projects: { id: string; title: string } | null;
  contacts: { id: string; name: string } | null;
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { status } = await searchParams;

  const db = supabaseAdmin();
  let query = db
    .from("invoices")
    .select("id, status, total_cents, currency, due_date, created_at, projects(id, title), contacts(id, name)")
    .order("created_at", { ascending: false });

  const validStatus = status === "draft" || status === "sent" || status === "paid" || status === "void";
  if (validStatus) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  const invoices = (data ?? []) as unknown as InvoiceRow[];

  return (
    <main>
      <h1>Invoices</h1>
      <p>
        <Link href="/admin">Back to admin</Link>
      </p>

      <form>
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <button type="submit">Filter</button>
        {validStatus && <Link href="/admin/invoices">Clear</Link>}
      </form>

      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Contact</th>
            <th>Status</th>
            <th>Total</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>
                <Link href={`/admin/invoices/${inv.id}`}>{inv.projects?.title ?? "Invoice"}</Link>
              </td>
              <td>{inv.contacts?.name ?? "—"}</td>
              <td>{inv.status}</td>
              <td>{formatCents(inv.total_cents, inv.currency)}</td>
              <td>{inv.due_date ?? "—"}</td>
            </tr>
          ))}
          {invoices.length === 0 && (
            <tr>
              <td colSpan={5}>No invoices found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
