import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTable } from "@/lib/db-errors";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/dates";
import { loadReminderSettings } from "@/lib/reminders/run";
import { REMINDER_SETTINGS, STEP_LABELS, type ReminderSetting } from "@/lib/reminders/schedule";
import { StatusPill } from "../../_components/ui";
import { runRemindersNow, setReminderActive } from "../actions";

export const dynamic = "force-dynamic";

const SETTING_COPY: Record<ReminderSetting, { name: string; rule: string }> = {
  invoice: {
    name: "Unpaid invoices",
    rule: "3 days before the due date, on the day, and 7 days after. Payment schedules get the same for each payment. No due date: once, a week after sending. Unpaid booking holds are left alone.",
  },
  contract: { name: "Unsigned contracts", rule: "3 and 7 days after the contract went out." },
  questionnaire: { name: "Unanswered questionnaires", rule: "3 and 7 days after the questionnaire went out." },
};

const KIND_LABELS: Record<string, string> = {
  invoice: "Invoice",
  installment: "Scheduled payment",
  contract: "Contract",
  questionnaire: "Questionnaire",
};

const STATUS_PILLS: Record<string, { tone: "green" | "amber" | "blue" | "red" | "grey"; label: string }> = {
  scheduled: { tone: "blue", label: "Scheduled" },
  running: { tone: "amber", label: "Sending" },
  sent: { tone: "green", label: "Sent" },
  skipped: { tone: "grey", label: "Skipped" },
  canceled: { tone: "grey", label: "Canceled" },
  failed: { tone: "red", label: "Failed" },
};

type JobRow = {
  id: string;
  kind: string;
  step: string;
  run_at: string;
  status: string;
  attempts: number;
  last_error: string | null;
  project_id: string | null;
  updated_at: string;
  contacts: { name: string | null } | null;
  projects: { title: string | null } | null;
};

const COLUMNS = "id, kind, step, run_at, status, attempts, last_error, project_id, updated_at, contacts(name), projects(title)";

function JobTable({ rows, empty, timeLabel }: { rows: JobRow[]; empty: string; timeLabel: string }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Reminder</th>
          <th>Client</th>
          <th>Project</th>
          <th>{timeLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pill = STATUS_PILLS[r.status] ?? { tone: "grey" as const, label: r.status };
          return (
            <tr key={r.id}>
              <td>
                <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
              </td>
              <td>
                {KIND_LABELS[r.kind] ?? r.kind} · {STEP_LABELS[r.step] ?? r.step}
                {r.last_error && <div className="hint">{r.last_error}</div>}
                {r.status === "scheduled" && r.attempts > 0 && <div className="hint err">Retry {r.attempts + 1}</div>}
              </td>
              <td>{r.contacts?.name ?? <span className="muted">—</span>}</td>
              <td>
                {r.project_id ? (
                  <Link href={`/admin/projects/${r.project_id}`}>{r.projects?.title ?? "Project"}</Link>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>
                {formatDateTime(r.status === "scheduled" ? r.run_at : r.updated_at)}
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={5} className="muted">
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ ran?: string }> }) {
  const { ran } = await searchParams;
  const settings = await loadReminderSettings();

  if (!settings) {
    return (
      <main>
        <h1>Reminders</h1>
        <p role="alert">Reminders aren&apos;t set up on this environment yet: run migration 0026_reminders.sql.</p>
      </main>
    );
  }

  const db = supabaseAdmin();
  const [upcoming, recent] = await Promise.all([
    db.from("automation_jobs").select(COLUMNS).in("status", ["scheduled", "running"]).order("run_at").limit(100),
    db
      .from("automation_jobs")
      .select(COLUMNS)
      .in("status", ["sent", "skipped", "canceled", "failed"])
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);
  for (const r of [upcoming, recent]) if (r.error && !isMissingTable(r.error)) throw r.error;

  return (
    <main className="fluid fluid-l">
      <div className="pagehead">
        <h1>Reminders</h1>
        <form action={runRemindersNow}>
          <button type="submit" className="btn">
            Run now
          </button>
        </form>
      </div>
      <p className="hint">
        Checked every hour. Reminders go out at 10 AM Eastern and stop the moment the invoice is paid, the contract is
        signed or the questionnaire is answered. Edit the wording in <Link href="/admin/emails">Email templates</Link>.
      </p>
      {!env.resendConfigured() && (
        <p role="alert">Sending is off on this environment, so due reminders are logged as skipped.</p>
      )}
      {ran && <p role="status">Ran: {ran}</p>}

      <table>
        <thead>
          <tr>
            <th>Remind clients about</th>
            <th>When</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {REMINDER_SETTINGS.map((kind) => (
            <tr key={kind}>
              <td>{SETTING_COPY[kind].name}</td>
              <td className="muted">{SETTING_COPY[kind].rule}</td>
              <td>
                <form action={setReminderActive.bind(null, kind, !settings[kind])}>
                  <button type="submit" className="btn">
                    {settings[kind] ? "On · turn off" : "Off · turn on"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Coming up</h2>
      <JobTable
        rows={(upcoming.data ?? []) as unknown as JobRow[]}
        empty="Nothing scheduled."
        timeLabel="Goes out"
      />

      <h2>Recent</h2>
      <JobTable rows={(recent.data ?? []) as unknown as JobRow[]} empty="Nothing yet." timeLabel="When" />
    </main>
  );
}
