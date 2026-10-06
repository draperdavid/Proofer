import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { TEMPLATES, isTemplateKey } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

type LogRow = {
  id: string;
  template_key: string;
  to_email: string;
  subject: string;
  status: "pending" | "sent" | "failed" | "skipped";
  delivery_status: string | null;
  delivery_detail: string | null;
  error: string | null;
  contact_id: string | null;
  created_at: string;
};

export default async function EmailLogPage() {
  const { data, error } = await supabaseAdmin()
    .from("email_log")
    .select("id, template_key, to_email, subject, status, error, contact_id, created_at, delivery_status, delivery_detail")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as LogRow[];

  return (
    <main>
      <h1>Email send log</h1>
      <p>
        <Link href="/admin/emails">Back to emails</Link>
      </p>
      <p style={{ fontSize: "0.8rem" }}>Latest 100. Times are UTC.</p>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Template</th>
            <th>To</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Delivery</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.created_at.slice(0, 16).replace("T", " ")}</td>
              <td>{isTemplateKey(r.template_key) ? TEMPLATES[r.template_key].name : r.template_key}</td>
              <td>{r.contact_id ? <Link href={`/admin/contacts/${r.contact_id}`}>{r.to_email}</Link> : r.to_email}</td>
              <td>{r.subject}</td>
              <td title={r.error ?? undefined}>
                {r.status}
                {r.error && r.status !== "sent" ? `: ${r.error}` : ""}
              </td>
              <td title={r.delivery_detail ?? undefined}>
                {r.delivery_status ?? (r.status === "sent" ? "awaiting report" : "")}
                {r.delivery_detail && (r.delivery_status === "bounced" || r.delivery_status === "complained")
                  ? `: ${r.delivery_detail}`
                  : ""}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6}>Nothing sent yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
