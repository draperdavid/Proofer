"use server";

// Email template edits + test sends (Phase 8.1). Every action checks
// requireAdmin() first. Test sends only ever go to the signed-in admin's own
// address, never to an address typed into a form.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-admin";
import { TEMPLATES, isTemplateKey, type TemplateKey } from "@/lib/email/templates";
import { cleanSubject, unknownFields } from "@/lib/email/render";
import { sendTemplatedEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/email/triggers";
import { isReminderSetting } from "@/lib/reminders/schedule";
import { runReminders } from "@/lib/reminders/run";

function templateKey(raw: string): TemplateKey {
  if (!isTemplateKey(raw)) throw new Error("Unknown email template");
  return raw;
}

export async function saveTemplate(rawKey: string, formData: FormData) {
  await requireAdmin();
  const key = templateKey(rawKey);
  const subject = cleanSubject(String(formData.get("subject") ?? ""));
  const body = String(formData.get("body") ?? "").replace(/\r\n?/g, "\n").trim();
  if (!subject) throw new Error("Subject is required");
  if (!body) throw new Error("Body is required");
  if (body.length > 10_000) throw new Error("Body is too long");

  const bad = unknownFields(subject + "\n" + body, TEMPLATES[key].fields);
  if (bad.length > 0) {
    throw new Error(`This template can't use ${bad.join(", ")}. Available: ${TEMPLATES[key].fields.map((f) => `{{${f}}}`).join(", ")}`);
  }

  const { error } = await supabaseAdmin()
    .from("email_templates")
    .upsert({ key, subject, body, updated_at: new Date().toISOString() });
  if (error) throw error;

  revalidatePath("/admin/emails");
  revalidatePath(`/admin/emails/${key}`);
}

export async function resetTemplate(rawKey: string) {
  await requireAdmin();
  const key = templateKey(rawKey);
  const { error } = await supabaseAdmin().from("email_templates").delete().eq("key", key);
  if (error) throw error;

  revalidatePath("/admin/emails");
  revalidatePath(`/admin/emails/${key}`);
}

export async function sendTestEmail(rawKey: string) {
  const user = await requireAdmin();
  const key = templateKey(rawKey);
  if (!user.email) throw new Error("Sign in again to send a test");

  const result = await sendTemplatedEmail({ key, to: user.email, fields: TEMPLATES[key].sample });
  revalidatePath("/admin/emails/log");
  redirect(`/admin/emails/${key}?test=${result.status}`);
}

// Lets an address receive email again (Phase 8.4), e.g. after the client
// fixed a typo'd address or asked to be mailed again.
export async function clearSuppression(email: string, returnTo: string) {
  await requireAdmin();
  const { error } = await supabaseAdmin().from("email_suppressions").delete().eq("email", email.trim().toLowerCase());
  if (error) throw error;
  revalidatePath("/admin/emails");
  // Only ever bounce back to an admin page.
  redirect(returnTo.startsWith("/admin/") ? returnTo : "/admin/emails");
}

// Switches one kind of scheduled reminder on or off (Phase 8.3). Switching
// off cancels its queued reminders on the next run.
export async function setReminderActive(kind: string, active: boolean) {
  await requireAdmin();
  if (!isReminderSetting(kind)) throw new Error("Unknown reminder type");
  const { error } = await supabaseAdmin()
    .from("reminder_settings")
    .upsert({ kind, active, updated_at: new Date().toISOString() });
  if (error) throw error;
  revalidatePath("/admin/emails/reminders");
}

// Runs the reminder queue now instead of waiting for the hourly cron.
export async function runRemindersNow() {
  await requireAdmin();
  const s = await runReminders({ baseUrl: await appBaseUrl() });
  revalidatePath("/admin/emails/reminders");
  revalidatePath("/admin/emails/log");
  const result = s.note
    ? s.note
    : `Queued ${s.queued}, sent ${s.sent}, skipped ${s.skipped}, retrying ${s.retrying}, failed ${s.failed}, canceled ${s.canceled}.`;
  redirect(`/admin/emails/reminders?ran=${encodeURIComponent(result)}`);
}
