// Templated email sending (Phase 8.1). Every attempt is written to email_log,
// including "skipped" when Resend isn't configured on this environment, so
// David can always see what would have gone out. Provider failures are
// returned, not thrown: an email failing must never undo the action that
// triggered it (a payment, a stage change).
import { supabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";
import { resend } from "@/lib/resend";
import { TEMPLATES, type TemplateKey } from "./templates";
import { isSendableEmail, renderEmail, unknownFields, type RenderedEmail } from "./render";

export type SendResult =
  | { status: "sent"; providerId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

// David's override if he has edited this template, else the built-in. An
// override that somehow carries an unknown field (edited directly in the DB)
// falls back to the default rather than mailing a broken token.
export async function loadTemplate(key: TemplateKey): Promise<{ subject: string; body: string; edited: boolean }> {
  const def = TEMPLATES[key];
  const { data, error } = await supabaseAdmin()
    .from("email_templates")
    .select("subject, body")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (data && unknownFields(data.subject + data.body, def.fields).length === 0) {
    return { subject: data.subject, body: data.body, edited: true };
  }
  return { subject: def.subject, body: def.body, edited: false };
}

export async function sendTemplatedEmail(opts: {
  key: TemplateKey;
  to: string;
  fields: Record<string, string | null | undefined>;
  contactId?: string | null;
  projectId?: string | null;
}): Promise<SendResult> {
  const to = opts.to.trim().toLowerCase();
  const template = await loadTemplate(opts.key);
  const email: RenderedEmail = renderEmail(template, opts.fields);

  let result: SendResult;
  if (!isSendableEmail(to)) {
    result = { status: "failed", error: "Not a valid email address" };
  } else if (!env.resendConfigured()) {
    result = { status: "skipped", reason: "Resend isn't configured (RESEND_API_KEY / RESEND_FROM_EMAIL)" };
  } else {
    try {
      const { data, error } = await resend().emails.send({
        from: env.resendFrom(),
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      result = error || !data ? { status: "failed", error: error?.message ?? "No response from Resend" } : { status: "sent", providerId: data.id };
    } catch (err) {
      result = { status: "failed", error: err instanceof Error ? err.message : "Send failed" };
    }
  }

  const { error: logErr } = await supabaseAdmin()
    .from("email_log")
    .insert({
      template_key: opts.key,
      to_email: to.slice(0, 320),
      subject: email.subject,
      status: result.status,
      provider_id: result.status === "sent" ? result.providerId : null,
      error: result.status === "failed" ? result.error.slice(0, 1000) : result.status === "skipped" ? result.reason : null,
      contact_id: opts.contactId ?? null,
      project_id: opts.projectId ?? null,
    });
  // The email outcome stands either way; a lost log line shouldn't fail the
  // caller, so it's only reported.
  if (logErr) console.error("email_log insert failed", logErr);

  return result;
}
