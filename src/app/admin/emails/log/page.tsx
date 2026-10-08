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
  project_id: string | null;
  created_at: string;
};

const COLUMNS =
  "id, template_key, to_email, subject, status, error, contact_id, project_id, created_at, delivery_status, delivery_detail";

const templateName = (key: string) => (isTemplateKey(key) ? TEMPLATES[key].name : key);
// created_at is an ISO timestamp in UTC; show it without going through a time zone.
const when = (iso: string) => `${formatDay(iso)}, ${iso.slice(11, 16)} UTC`;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ folder?: string; id?: string }> }) {
  const { folder: folderParam, id } = await searchParams;
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

  // The open email: from the list if it's there, otherwise fetch it (older than the list).
  let selected: LogRow | null = null;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    selected = rows.find((r) => r.id === id) ?? null;
    if (!selected) {
      const { data } = await db.from("email_log").select(COLUMNS).eq("id", id).maybeSingle();
      selected = (data as LogRow | null) ?? null;
    }
  }

  let contactName: string | null = null;
  let projectTitle: string | null = null;
  if (selected) {
    const [c, p] = await Promise.all([
      selected.contact_id ? db.from("contacts").select("name").eq("id", selected.contact_id).maybeSingle() : null,
      selected.project_id ? db.from("projects").select("title").eq("id", selected.project_id).maybeSingle() : null,
    ]);
    contactName = (c?.data as { name: string } | null)?.name ?? null;
    projectTitle = (p?.data as { title: string } | null)?.title ?? null;
  }

  const href = (f: FolderKey, mailId?: string) => `/admin/emails/log?folder=${f}${mailId ? `&id=${mailId}` : ""}`;

  return (
    <main className="mailpage">
      <div className="mail">
        <aside className="mail-side">
          <h1>Inbox</h1>
          <nav aria-label="Folders">
            {FOLDERS.map((f) => (
              <Link key={f.key} href={href(f.key)} className={`mfolder${f.key === folder ? " on" : ""}`}>
                <span>{f.label}</span>
                <span className="n">{counts[f.key]}</span>
              </Link>
            ))}
          </nav>
          <div className="mail-side-foot">
            <Link href="/admin/emails">Email templates</Link>
          </div>
        </aside>

        <section className="mail-list" aria-label="Emails">
          {rows.map((r) => {
            const pill = mailPill(r);
            return (
              <Link key={r.id} href={href(folder, r.id)} className={`mrow${selected?.id === r.id ? " on" : ""}`}>
                <div className="mrow-top">
                  <strong>{r.to_email}</strong>
                  <span className="muted">{formatDay(r.created_at, false)}</span>
                </div>
                <div className="mrow-sub">{r.subject}</div>
                <div className="mrow-meta">
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                  <span className="muted">{templateName(r.template_key)}</span>
                </div>
              </Link>
            );
          })}
          {rows.length === 0 && (
            <p className="muted" style={{ padding: "var(--sp-5)" }}>
              {folder === "all" ? "Nothing sent yet." : "Nothing in this folder."}
            </p>
          )}
        </section>

        <section className="mail-read" aria-label="Email details">
          {selected ? (
            <>
              <h2>{selected.subject}</h2>
              <dl className="mdl">
                <dt>To</dt>
                <dd>
                  {selected.contact_id ? (
                    <Link href={`/admin/contacts/${selected.contact_id}`}>{contactName ?? selected.to_email}</Link>
                  ) : (
                    selected.to_email
                  )}
                  {contactName && <span className="muted"> &lt;{selected.to_email}&gt;</span>}
                </dd>
                <dt>Template</dt>
                <dd>{templateName(selected.template_key)}</dd>
                <dt>Sent</dt>
                <dd>{when(selected.created_at)}</dd>
                <dt>Status</dt>
                <dd>
                  <StatusPill tone={mailPill(selected).tone}>{mailPill(selected).label}</StatusPill>
                </dd>
                {projectTitle && selected.project_id && (
                  <>
                    <dt>Project</dt>
                    <dd>
                      <Link href={`/admin/projects/${selected.project_id}`}>{projectTitle}</Link>
                    </dd>
                  </>
                )}
              </dl>
              {selected.error && <p className="notice err">Error: {selected.error}</p>}
              {selected.delivery_detail && <p className="notice">Delivery report: {selected.delivery_detail}</p>}
              <p className="hint">
                The message text isn&apos;t stored. To see what a template says, open it under{" "}
                <Link href="/admin/emails">Email templates</Link>.
              </p>
            </>
          ) : (
            <p className="muted mail-empty">Select an email to see its details.</p>
          )}
        </section>
      </div>
    </main>
  );
}
