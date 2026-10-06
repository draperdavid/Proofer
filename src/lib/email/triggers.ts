// Event-triggered email (Phase 8.2). Each trigger loads what it needs, sends
// through sendTemplatedEmail with a per-event idempotency key, and never
// throws: an email problem must not undo the stage change, status change or
// send that fired it. Every outcome lands in email_log.
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";
import { sendTemplatedEmail } from "./send";
import { isStageTemplate, isTemplateKey } from "./templates";
import { absoluteUrl, formatCents, formatDate, idempotencyKeys, projectFields } from "./events";

// Links in emails need an absolute URL. APP_BASE_URL wins when set; otherwise
// use the host the admin is on (these triggers run in admin actions, or in the
// inquiry route whose emails carry no links).
export async function appBaseUrl(): Promise<string> {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Outside a request (shouldn't happen for these triggers).
  }
  return env.appBaseUrl();
}

async function safely(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`email trigger failed: ${label}`, err);
  }
}

type ContactRow = { id: string; name: string | null; email: string | null };

async function loadContact(contactId: string | null): Promise<ContactRow | null> {
  if (!contactId) return null;
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .select("id, name, email")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw error;
  return (data as ContactRow | null) ?? null;
}

// A project just entered `stageId` (created there, dragged there, or edited
// there). Sends every active rule's template for that stage, once each.
export async function onStageEntered(projectId: string, stageId: string | null) {
  if (!stageId) return;
  await safely(`stage ${stageId} for project ${projectId}`, async () => {
    const db = supabaseAdmin();
    const { data: rules, error } = await db
      .from("automation_rules")
      .select("template_key")
      .eq("stage_id", stageId)
      .eq("active", true);
    if (error) throw error;
    if (!rules || rules.length === 0) return;

    const { data: project, error: projectErr } = await db
      .from("projects")
      .select("id, title, contact_id")
      .eq("id", projectId)
      .single();
    if (projectErr || !project) throw projectErr ?? new Error("Project not found");
    const contact = await loadContact(project.contact_id as string | null);
    if (!contact) return;

    for (const rule of rules) {
      const key = String(rule.template_key);
      // A rule pointing at a template that's gone or needs fields a project
      // can't fill is ignored rather than mailing a half-empty email.
      if (!isTemplateKey(key) || !isStageTemplate(key)) continue;
      await sendTemplatedEmail({
        key,
        to: contact.email ?? "",
        fields: projectFields(contact.name, project.title as string),
        contactId: contact.id,
        projectId: project.id as string,
        idempotencyKey: idempotencyKeys.stageEntered(project.id as string, stageId, key),
      });
    }
  });
}

// An invoice was marked sent: email the pay link.
export async function onInvoiceSent(invoiceId: string) {
  await safely(`invoice ${invoiceId}`, async () => {
    const { data: invoice, error } = await supabaseAdmin()
      .from("invoices")
      .select("id, contact_id, project_id, total_cents, due_date, status")
      .eq("id", invoiceId)
      .single();
    if (error || !invoice) throw error ?? new Error("Invoice not found");
    if (invoice.status !== "sent") return;
    const contact = await loadContact(invoice.contact_id as string | null);
    if (!contact) return;

    const base = await appBaseUrl();
    await sendTemplatedEmail({
      key: "invoice_sent",
      to: contact.email ?? "",
      fields: {
        ...projectFields(contact.name, null),
        "invoice.amount": formatCents(Number(invoice.total_cents)),
        "invoice.due_date": formatDate(invoice.due_date as string | null) || "on receipt",
        "invoice.link": absoluteUrl(base, `/pay/${invoice.id}`),
      },
      contactId: contact.id,
      projectId: (invoice.project_id as string | null) ?? null,
      idempotencyKey: idempotencyKeys.invoiceSent(invoice.id as string, Number(invoice.total_cents)),
    });
  });
}

// A quote was marked sent: email the link to pick a package.
export async function onQuoteSent(quoteId: string) {
  await safely(`quote ${quoteId}`, async () => {
    const { data: quote, error } = await supabaseAdmin()
      .from("quotes")
      .select("id, title, project_id, contact_id, status")
      .eq("id", quoteId)
      .single();
    if (error || !quote) throw error ?? new Error("Quote not found");
    if (quote.status !== "sent") return;
    const contact = await loadContact(quote.contact_id as string | null);
    if (!contact) return;

    const base = await appBaseUrl();
    await sendTemplatedEmail({
      key: "quote_sent",
      to: contact.email ?? "",
      fields: {
        ...projectFields(contact.name, null),
        "quote.title": String(quote.title ?? ""),
        "quote.link": absoluteUrl(base, `/quote/${quote.id}`),
      },
      contactId: contact.id,
      projectId: quote.project_id as string,
      idempotencyKey: idempotencyKeys.quoteSent(quote.id as string),
    });
  });
}

// A questionnaire was created for a project: email the fill-in link.
export async function onQuestionnaireSent(questionnaireId: string) {
  await safely(`questionnaire ${questionnaireId}`, async () => {
    const db = supabaseAdmin();
    const { data: q, error } = await db
      .from("questionnaires")
      .select("id, project_id, contact_id")
      .eq("id", questionnaireId)
      .single();
    if (error || !q) throw error ?? new Error("Questionnaire not found");
    const { data: project, error: projectErr } = await db
      .from("projects")
      .select("title")
      .eq("id", q.project_id)
      .single();
    if (projectErr || !project) throw projectErr ?? new Error("Project not found");
    const contact = await loadContact(q.contact_id as string | null);
    if (!contact) return;

    const base = await appBaseUrl();
    await sendTemplatedEmail({
      key: "questionnaire_sent",
      to: contact.email ?? "",
      fields: {
        ...projectFields(contact.name, project.title as string),
        "questionnaire.link": absoluteUrl(base, `/questionnaire/${q.id}`),
      },
      contactId: contact.id,
      projectId: q.project_id as string,
      idempotencyKey: idempotencyKeys.questionnaireSent(q.id as string),
    });
  });
}
