import Link from "next/link";
import { TemplatesTabs } from "../_components/templates-tabs";
import { supabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";
import { TEMPLATES, TEMPLATE_KEYS } from "@/lib/email/templates";
import { clearSuppression } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const { data, error } = await supabaseAdmin().from("email_templates").select("key, updated_at");
  if (error) throw error;
  const edited = new Map((data ?? []).map((r) => [r.key as string, r.updated_at as string]));
  const configured = env.resendConfigured();
  const webhookOn = Boolean(env.resendWebhookSecret());
  // Tolerate the 8.4 table not being migrated yet.
  const { data: blocked } = await supabaseAdmin()
    .from("email_suppressions")
    .select("email, reason, detail, created_at")
    .order("created_at", { ascending: false });

  return (
    <main>
      <TemplatesTabs active="emails" />
      <p>
        <Link href="/admin/emails/log">Open the inbox</Link> to see sent emails and whether they were delivered.
      </p>

      {configured ? (
        <p>Sending from {env.resendFrom()} via Resend.</p>
      ) : (
        <p role="alert">
          Sending is off on this environment: RESEND_API_KEY and RESEND_FROM_EMAIL aren&apos;t both set. Emails are
          logged as skipped until they are.
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Template</th>
            <th>When it&apos;s used</th>
            <th>Version</th>
          </tr>
        </thead>
        <tbody>
          {TEMPLATE_KEYS.map((key) => (
            <tr key={key}>
              <td>
                <Link href={`/admin/emails/${key}`}>{TEMPLATES[key].name}</Link>
              </td>
              <td>{TEMPLATES[key].description}</td>
              <td>{edited.has(key) ? `Edited ${edited.get(key)!.slice(0, 10)}` : "Default"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        Sent automatically: invoices and quotes when you mark them sent, questionnaires when you send them, and any{" "}
        <Link href="/admin/projects/stages">stage emails</Link> you set up.
      </p>

      <h2>Blocked addresses</h2>
      <p className="hint">
        {webhookOn
          ? "Addresses that hard-bounced or marked an email as spam. Nothing is sent to them until you clear them."
          : "Bounce tracking is off: RESEND_WEBHOOK_SECRET isn't set, so bounces and spam reports aren't recorded yet."}
      </p>
      <ul>
        {(blocked ?? []).length === 0 && <li>None.</li>}
        {(blocked ?? []).map((b) => (
          <li key={b.email as string}>
            <form
              action={clearSuppression.bind(null, b.email as string, "/admin/emails")}
              style={{ display: "flex", gap: "0.5rem" }}
            >
              <span>
                {b.email as string} · {b.reason === "complained" ? "marked as spam" : "bounced"}{" "}
                {String(b.created_at).slice(0, 10)}
                {b.detail ? ` · ${b.detail as string}` : ""}
              </span>
              <button type="submit">Clear</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
