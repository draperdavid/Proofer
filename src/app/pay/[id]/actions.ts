"use server";

// Creates a Stripe Checkout Session for a single invoice (test mode is just
// whichever STRIPE_SECRET_KEY is configured — nothing here branches on it).
//
// Money-code care: the whole invoice total (already server-computed and
// stored on the invoice by task 2.1's actions.ts) is sent to Stripe as one
// line item, rather than trying to replicate discount/tax as separate Stripe
// line items — this guarantees the amount Stripe charges always matches
// invoices.total_cents exactly, which task 2.6's reconciliation check
// depends on. Nothing here can mark the invoice paid; only the signature-
// verified webhook built in task 2.3 is allowed to do that.
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import type { Invoice, InvoiceInstallment } from "@/app/admin/invoices/types";
import { isMissingTable } from "@/lib/db-errors";

export async function createCheckoutSession(invoiceId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("invoices")
    .select("*, projects(title)")
    .eq("id", invoiceId)
    .single();
  if (error || !data) throw new Error("Invoice not found");

  const invoice = data as unknown as Invoice & { projects: { title: string } | null };

  if (invoice.status !== "sent") {
    throw new Error("Only a sent invoice can be paid");
  }
  if (invoice.total_cents <= 0) {
    throw new Error("Invoice total must be greater than zero");
  }

  // With a payment schedule (2.4) the client pays the earliest unpaid
  // installment, for exactly its stored amount; the webhook checks it again.
  const { data: schedule, error: scheduleError } = await db
    .from("invoice_installments")
    .select("id, label, amount_cents, status, position")
    .eq("invoice_id", invoice.id)
    .order("position", { ascending: true });
  // Missing table = migration 0023 not run here yet: no schedules exist.
  if (scheduleError && !isMissingTable(scheduleError)) throw scheduleError;
  const installments = (schedule ?? []) as Pick<InvoiceInstallment, "id" | "label" | "amount_cents" | "status" | "position">[];
  const next = installments.find((i) => i.status === "unpaid") ?? null;
  if (installments.length > 0 && !next) throw new Error("Every payment on this invoice is already made");

  const title = invoice.projects?.title ? `Invoice — ${invoice.projects.title}` : "Invoice";
  const baseUrl = env.appBaseUrl();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: invoice.currency,
          product_data: { name: next ? `${title} (${next.label})` : title },
          unit_amount: next ? next.amount_cents : invoice.total_cents,
        },
        quantity: 1,
      },
    ],
    client_reference_id: invoice.id,
    metadata: next ? { invoice_id: invoice.id, installment_id: next.id } : { invoice_id: invoice.id },
    success_url: `${baseUrl}/pay/${invoice.id}/success`,
    cancel_url: `${baseUrl}/pay/${invoice.id}`,
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");

  const { error: updateError } = next
    ? await db.from("invoice_installments").update({ stripe_checkout_session_id: session.id }).eq("id", next.id)
    : await db.from("invoices").update({ stripe_checkout_session_id: session.id }).eq("id", invoice.id);
  if (updateError) throw updateError;

  redirect(session.url);
}
