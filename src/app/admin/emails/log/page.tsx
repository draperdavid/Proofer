import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { TEMPLATES, isTemplateKey } from "@/lib/email/templates";
import { FOLDERS, countFolders, inFolder, isFolderKey, mailPill, type FolderKey } from "@/lib/email/inbox";
import { formatDay } from "@/lib/dates";
import { StatusPill } from "../../_components/ui";

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

const COLUMNS = "id, template_key, to_email, subject, status, error, contact_id, created_at, delivery_status, delivery_detail";

const templateName = (key: string) => (isTemplateKey(key) ? TEMPLATES[key].name : key);
// created_at is an ISO timestamp in UTC; show it without going through a time zone.
const when = (iso: string) => `${formatDay(iso, false)}, ${iso.slice(11, 16)}`;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const { folder: folderParam } = await searchParams;
  const folder: FolderKey = isFolderKey(folderParam) ? folderParam : "all";

  const db = supabaseAdmin();
  const [slim, list] = await Promise.all([
    // Light columns only, so the folder counts cover far more mail than the list shows.
    db.from("email_log").select("status, delivery_status").limit(5000),
    db.from("email_log").select(COLUMNS).order("created_at", { ascending: false }).limit(300),
  ]);
  if (slim.error) throw slim.error;
  if (list.error) throw list.error;

  const counts = countFolders(slim.data ?? []);
  const rows = ((list.data ?? []) as LogRow[]).filter((r) => inFolder(r, folder));

  return (
    <main>
      <div className="pagehead">
        <h1>Inbox</h1>
        <Link href="/admin/emails" className="btn">
          Email templates
        </Link>
      </div>

      <div className="inbox">
        <nav className="inbox-folders" aria-label="Folders">
          {FOLDERS.map((f) => (
            <Link key={f.key} href={`/admin/emails/log?folder=${f.key}`} className={f.key === folder ? "on" : undefined}>
              <span>{f.label}</span>
              <span className="n">{counts[f.key]}</span>
            </Link>
          ))}
        </nav>

        <div className="inbox-main">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>To</th>
                <th>Subject</th>
                <th>Template</th>
                <th>Sent (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pill = mailPill(r);
                const problem = r.error ?? (pill.tone === "red" ? r.delivery_detail : null);
                return (
                  <tr key={r.id}>
                    <td>
                      <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                    </td>
                    <td>{r.contact_id ? <Link href={`/admin/contacts/${r.contact_id}`}>{r.to_email}</Link> : r.to_email}</td>
                    <td>
                      {r.subject}
                      {problem && <div className="hint err">{problem}</div>}
                    </td>
                    <td className="muted">{templateName(r.template_key)}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>
                      {when(r.created_at)}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {folder === "all" ? "Nothing sent yet." : "Nothing in this folder."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="hint">Showing the latest 300. Message text isn&apos;t stored; see Email templates for what each one says.</p>
        </div>
      </div>
    </main>
  );
}
