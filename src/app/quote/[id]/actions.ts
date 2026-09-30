"use server";

// Public quote acceptance — no Supabase session reaches this route, so the
// only thing trusted from the client is *which* package id they picked. The
// package must belong to this quote, the quote must be `sent`, and the line
// items and prices come from the database, never the form — same approach as
// /pay's checkout-session creation and /questionnaire's answer validation.
//
// Accepting drafts an invoice (status "draft", totals recomputed server-side
// by insertDraftInvoice). No Stripe or payment code is touched here.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { insertDraftInvoice } from "@/app/admin/invoices/draft";
import type { Quote, QuotePackage } from "@/app/admin/quotes/types";

export async function acceptPackage(quoteId: string, packageId: string) {
  const db = supabaseAdmin();

  const { data: quoteRow, error: quoteError } = await db.from("quotes").select("*").eq("id", quoteId).single();
  if (quoteError || !quoteRow) throw quoteError ?? new Error("Quote not found");
  const quote = quoteRow as Quote;
  if (quote.status !== "sent") throw new Error("This quote is not open for acceptance");

  const { data: pkgRow, error: pkgError } = await db
    .from("quote_packages")
    .select("*")
    .eq("id", packageId)
    .eq("quote_id", quoteId)
    .single();
  if (pkgError || !pkgRow) throw pkgError ?? new Error("Package not found");
  const pkg = pkgRow as QuotePackage;

  // Claim the quote with a conditional update first, so a double-click or two
  // tabs can't both accept (and draft two invoices): only the request that
  // flips it from `sent` gets a row back.
  const acceptedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await db
    .from("quotes")
    .update({ status: "accepted", accepted_package_id: pkg.id, accepted_at: acceptedAt, updated_at: acceptedAt })
    .eq("id", quoteId)
    .eq("status", "sent")
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) throw new Error("This quote has already been accepted");

  let invoiceId: string;
  try {
    invoiceId = await insertDraftInvoice(
      db,
      {
        project_id: quote.project_id,
        contact_id: quote.contact_id,
        currency: quote.currency,
        tax_rate: Number(quote.tax_rate),
        notes: `From quote "${quote.title}" — ${pkg.name}`,
      },
      pkg.line_items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit_price_cents: Math.round(Number(item.unit_price_cents)),
      }))
    );
  } catch (err) {
    // Release the claim so the client can retry rather than being stuck on
    // an "accepted" quote with no invoice behind it.
    await db
      .from("quotes")
      .update({ status: "sent", accepted_package_id: null, accepted_at: null, updated_at: new Date().toISOString() })
      .eq("id", quoteId);
    throw err;
  }

  const { error: linkError } = await db.from("quotes").update({ invoice_id: invoiceId }).eq("id", quoteId);
  if (linkError) throw linkError;

  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath(`/admin/projects/${quote.project_id}`);
  revalidatePath("/admin/invoices");
  redirect(`/quote/${quoteId}`);
}
