// Public quote page — no auth, reached via a link David sends the client.
// Reads through supabaseAdmin() (service-role) same as /inquire, /pay, and
// /questionnaire: safe because this runs server-side only, never exposing the
// service-role key to the browser.
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { formatCents } from "@/app/admin/invoices/money";
import { packageTotals } from "@/app/admin/quotes/totals";
import type { Quote, QuotePackage } from "@/app/admin/quotes/types";
import { acceptPackage } from "./actions";

export const dynamic = "force-dynamic";

type QuoteWithProject = Quote & { projects: { title: string } | null };

export default async function ViewQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [{ data, error }, { data: pkgs, error: pkgsError }] = await Promise.all([
    db.from("quotes").select("*, projects(title)").eq("id", id).single(),
    db.from("quote_packages").select("*").eq("quote_id", id).order("position", { ascending: true }),
  ]);
  if (error || !data) notFound();
  if (pkgsError) throw pkgsError;

  const quote = data as unknown as QuoteWithProject;
  // A draft quote hasn't been sent yet, so it isn't visible to anyone with the link.
  if (quote.status === "draft") notFound();

  const packages = (pkgs ?? []) as QuotePackage[];
  const accepted = quote.status === "accepted";
  const acceptedPackage = packages.find((p) => p.id === quote.accepted_package_id);

  return (
    <main>
      <h1>{quote.title}</h1>
      {quote.projects && <p>{quote.projects.title}</p>}
      {quote.notes && <p>{quote.notes}</p>}

      {accepted && (
        <p>
          Thanks — you accepted {acceptedPackage ? <strong>{acceptedPackage.name}</strong> : "a package"}. We&apos;ll
          be in touch with your invoice.
        </p>
      )}

      {packages.map((pkg) => {
        const totals = packageTotals(pkg.line_items, quote.tax_rate);
        const accept = acceptPackage.bind(null, quote.id, pkg.id);
        return (
          <section key={pkg.id}>
            <h2>{pkg.name}</h2>
            {pkg.description && <p>{pkg.description}</p>}
            <table>
              <tbody>
                {pkg.line_items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.description}</td>
                    <td>{item.quantity !== 1 ? `× ${item.quantity}` : ""}</td>
                    <td>{formatCents(Math.round(item.quantity * item.unit_price_cents), quote.currency)}</td>
                  </tr>
                ))}
                {totals.taxCents > 0 && (
                  <tr>
                    <td>Tax</td>
                    <td></td>
                    <td>{formatCents(totals.taxCents, quote.currency)}</td>
                  </tr>
                )}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td></td>
                  <td>
                    <strong>{formatCents(totals.totalCents, quote.currency)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
            {!accepted && (
              <form action={accept}>
                <button type="submit">Accept {pkg.name}</button>
              </form>
            )}
          </section>
        );
      })}
    </main>
  );
}
