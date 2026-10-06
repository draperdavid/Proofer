import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";
import { TEMPLATES, TEMPLATE_KEYS } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const { data, error } = await supabaseAdmin().from("email_templates").select("key, updated_at");
  if (error) throw error;
  const edited = new Map((data ?? []).map((r) => [r.key as string, r.updated_at as string]));
  const configured = env.resendConfigured();

  return (
    <main>
      <h1>Emails</h1>
      <p>
        <Link href="/admin">Back to admin</Link>
        {" | "}
        <Link href="/admin/emails/log">Send log</Link>
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
      <p style={{ fontSize: "0.8rem" }}>Nothing sends automatically yet. Event triggers come in 8.2.</p>
    </main>
  );
}
