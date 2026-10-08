import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteQuote, updateQuote, updateQuoteStatus } from "../actions";
import { PackagesEditor } from "../packages-editor";
import { packageTotals } from "../totals";
import { formatCents } from "../../invoices/money";
import type { Quote, QuotePackage } from "../types";
import { ClientLink } from "@/app/admin/_components/client-link";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";

export const dynamic = "force-dynamic";

type QuoteWithRelations = Quote & {
  projects: { id: string; title: string } | null;
  contacts: { id: string; name: string } | null;
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [{ data, error }, { data: pkgs, error: pkgsError }] = await Promise.all([
    db.from("quotes").select("*, projects(id, title), contacts(id, name)").eq("id", id).single(),
    db.from("quote_packages").select("*").eq("quote_id", id).order("position", { ascending: true }),
  ]);
  if (error || !data) notFound();
  if (pkgsError) throw pkgsError;

  const quote = data as unknown as QuoteWithRelations;
  const packages = (pkgs ?? []) as QuotePackage[];
  const accepted = quote.status === "accepted";
  const acceptedPackage = packages.find((p) => p.id === quote.accepted_package_id);

  const updateThisQuote = updateQuote.bind(null, quote.id);
  const deleteThisQuote = deleteQuote.bind(null, quote.id, quote.project_id);
  const markSent = updateQuoteStatus.bind(null, quote.id, "sent");
  const markDraft = updateQuoteStatus.bind(null, quote.id, "draft");

  return (
    <main>
      <h1>Quote: {quote.title}</h1>
      <p>
        {quote.projects ? (
          <Link className="back" href={`/admin/projects/${quote.projects.id}`}>← Back to {quote.projects.title}</Link>
        ) : (
          <Link className="back" href="/admin/projects">← Back to projects</Link>
        )}
      </p>
      <p>
        Status: <strong>{quote.status}</strong>
        {quote.contacts ? ` · ${quote.contacts.name}` : ""}
      </p>

      {quote.status === "sent" && (
        <p>
          Client link: <ClientLink path={`/quote/${quote.id}`} />
        </p>
      )}

      {accepted && (
        <>
          <p>
            Accepted package: <strong>{acceptedPackage?.name ?? "(unknown)"}</strong>
            {acceptedPackage &&
              ` · ${formatCents(packageTotals(acceptedPackage.line_items, quote.tax_rate).totalCents, quote.currency)}`}
            {quote.accepted_at ? ` · ${new Date(quote.accepted_at).toLocaleString()}` : ""}
          </p>
          <p>
            {quote.invoice_id ? (
              <Link href={`/admin/invoices/${quote.invoice_id}`}>View drafted invoice</Link>
            ) : (
              "No invoice linked."
            )}
          </p>
          <h2>Packages offered</h2>
          <ul>
            {packages.map((p) => (
              <li key={p.id}>
                {p.name} — {formatCents(packageTotals(p.line_items, quote.tax_rate).totalCents, quote.currency)}
              </li>
            ))}
          </ul>
        </>
      )}

      {!accepted && (
        <>
          <form action={updateThisQuote}>
            <input type="hidden" name="project_id" value={quote.project_id} />
            <input type="hidden" name="contact_id" value={quote.contact_id} />
            <div>
              <label htmlFor="title">Title</label>
              <input id="title" name="title" type="text" required defaultValue={quote.title} />
            </div>
            <PackagesEditor packages={packages} taxRate={quote.tax_rate} />
            <div>
              <label htmlFor="notes">Notes (shown to the client)</label>
              <textarea id="notes" name="notes" defaultValue={quote.notes ?? ""} />
            </div>
            <button type="submit">Save changes</button>
          </form>

          <h2>Status</h2>
          <form action={quote.status === "draft" ? markSent : markDraft}>
            <button type="submit">{quote.status === "draft" ? "Mark as sent and email client" : "Revert to draft"}</button>
          </form>

          <form action={deleteThisQuote}>
            <ConfirmButton message="Delete this quote? This can't be undone.">Delete quote</ConfirmButton>
          </form>
        </>
      )}
    </main>
  );
}
