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
  // Event-triggered sends (Phase 8.2) pass one; a second send with the same
  // key returns "duplicate" without mailing anyone.
  idempotencyKey?: string;
}): Promise<SendResult | { status: "duplicate" }> {
  const to = opts.to.trim().toLowerCase();
  const template = await loadTemplate(opts.key);
  const email: RenderedEmail = renderEmail(template, opts.fields);
  const db = supabaseAdmin();

  const logRow = {
    template_key: opts.key,
    to_email: to.slice(0, 320),
    subject: email.subject,
    contact_id: opts.contactId ?? null,
    project_id: opts.projectId ?? null,
  };

  // Claim the event before sending. The unique index on idempotency_key makes
  // this the single point where two racing requests are told apart.
  let claimId: string | null = null;
  if (opts.idempotencyKey) {
    const { data, error } = await db
      .from("email_log")
      .insert({ ...logRow, status: "pending", idempotency_key: opts.idempotencyKey })
      .select("id")
      .single();
    if (error?.code === "23505") return { status: "duplicate" };
    if (error || !data) {
      // Without a claim there's no duplicate guard, so don't send.
      console.error("email_log claim failed", error);
      return { status: "failed", error: "Couldn't record the send, so it wasn't sent" };
    }
    claimId = data.id as string;
  }

  const result = await deliver(to, email);

  const outcome = {
    status: result.status,
    provider_id: result.status === "sent" ? result.providerId : null,
    error: result.status === "failed" ? result.error.slice(0, 1000) : result.status === "skipped" ? result.reason : null,
  };
  // Only a real send keeps its key; a failed or skipped one frees it so the
  // next occurrence of the event can try again.
  const { error: logErr } = claimId
    ? await db
        .from("email_log")
        .update({ ...outcome, ...(result.status === "sent" ? {} : { idempotency_key: null }) })
        .eq("id", claimId)
    : await db.from("email_log").insert({ ...logRow, ...outcome });
  // The email outcome stands either way; a lost log line shouldn't fail the
  // caller, so it's only reported.
  if (logErr) console.error("email_log write failed", logErr);

  return result;
}

async function deliver(to: string, email: RenderedEmail): Promise<SendResult> {
  if (!isSendableEmail(to)) return { status: "failed", error: "Not a valid email address" };
  // Addresses that hard-bounced or reported spam are never mailed again until
  // David clears them (Phase 8.4); mailing them anyway hurts the domain.
  const { data: suppressed, error: supErr } = await supabaseAdmin()
    .from("email_suppressions")
    .select("reason, created_at")
    .eq("email", to)
    .maybeSingle();
  // 42P01 = table not migrated yet on this environment: nothing is suppressed.
  if (supErr && supErr.code !== "42P01") return { status: "failed", error: "Couldn't check the address against bounces" };
  if (suppressed) {
    const when = String(suppressed.created_at).slice(0, 10);
    return {
      status: "skipped",
      reason: suppressed.reason === "complained" ? `Marked as spam on ${when}` : `Address bounced on ${when}`,
    };
  }
  if (!env.resendConfigured()) {
    return { status: "skipped", reason: "Resend isn't configured (RESEND_API_KEY / RESEND_FROM_EMAIL)" };
  }
  try {
    const { data, error } = await resend().emails.send({
      from: env.resendFrom(),
      to: [to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return error || !data ? { status: "failed", error: error?.message ?? "No response from Resend" } : { status: "sent", providerId: data.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Send failed" };
  }
}
