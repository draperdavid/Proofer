// Scheduled reminders (Phase 8.3): which reminders each open document should
// get, and how the automation_jobs queue moves toward that. Pure, no imports,
// so Node's test runner can load it.
//
// Rules:
//   * Invoices with a due date: 3 days before, on the day, and 7 days after.
//     Without a due date: one reminder a week after the queue first sees it.
//   * Installments (payment schedules): the same three around their own due
//     date. Installments with no due date get none.
//   * Contracts awaiting signature and unanswered questionnaires: 3 and 7
//     days after they went out.
//   * Every reminder goes out at 10:00 business time on its day.
//   * A reminder whose time had already passed when the queue first saw it is
//     never created, so switching reminders on (or sending a document late)
//     doesn't fire a backlog of catch-up emails.

export type ReminderKind = "invoice" | "installment" | "contract" | "questionnaire";
// What David switches on and off. Installments ride with invoices.
export type ReminderSetting = "invoice" | "contract" | "questionnaire";

export const REMINDER_SETTINGS: readonly ReminderSetting[] = ["invoice", "contract", "questionnaire"];

export function isReminderSetting(value: string): value is ReminderSetting {
  return (REMINDER_SETTINGS as readonly string[]).includes(value);
}

export const SETTING_FOR: Record<ReminderKind, ReminderSetting> = {
  invoice: "invoice",
  installment: "invoice",
  contract: "contract",
  questionnaire: "questionnaire",
};

export const STEP_LABELS: Record<string, string> = {
  before_due: "3 days before due",
  due: "On the due date",
  overdue: "7 days overdue",
  no_due_date: "A week after sending",
  day_3: "3 days after sending",
  day_7: "7 days after sending",
};

export const BUSINESS_TIME_ZONE = "America/New_York";
export const SEND_HOUR = 10;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// A reminder that couldn't go out within this long of its time is dropped:
// "due in 3 days" arriving a week late is worse than nothing.
export const STALE_AFTER_MS = 2 * DAY;
export const MAX_ATTEMPTS = 4;
// A job left "running" this long (the Worker died mid-send) is put back.
export const STUCK_AFTER_MS = 15 * 60 * 1000;

// "2026-10-20" + 3 -> "2026-10-23". Calendar arithmetic, no time zone.
export function addDays(day: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`Invalid date "${day}"`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)).toISOString().slice(0, 10);
}

// The calendar day an instant falls on in `timeZone`.
export function businessDay(instant: Date, timeZone = BUSINESS_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

// `hour`:00 on `day` in `timeZone`, as a real instant. One offset correction
// is exact for daytime hours: US DST changes happen at 2 AM.
export function businessMorning(day: string, timeZone = BUSINESS_TIME_ZONE, hour = SEND_HOUR): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`Invalid date "${day}"`);
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour);
  const p: Record<string, number> = {};
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(asUtc));
  for (const part of parts) if (part.type !== "literal") p[part.type] = Number(part.value);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(asUtc - (wall - asUtc));
}

export type DesiredJob = {
  kind: ReminderKind;
  targetId: string;
  step: string;
  // null: no fixed time; a week after the job is first created.
  runAt: Date | null;
  contactId: string | null;
  projectId: string | null;
};

type Owner = { contact_id: string | null; project_id: string | null };

function dueDateSteps(kind: "invoice" | "installment", id: string, dueDate: string, owner: Owner): DesiredJob[] {
  const job = (step: string, day: string): DesiredJob => ({
    kind,
    targetId: id,
    step,
    runAt: businessMorning(day),
    contactId: owner.contact_id,
    projectId: owner.project_id,
  });
  return [job("before_due", addDays(dueDate, -3)), job("due", dueDate), job("overdue", addDays(dueDate, 7))];
}

// An unpaid invoice without a payment schedule.
export function invoiceSteps(invoice: Owner & { id: string; due_date: string | null }): DesiredJob[] {
  if (invoice.due_date) return dueDateSteps("invoice", invoice.id, invoice.due_date, invoice);
  return [
    {
      kind: "invoice",
      targetId: invoice.id,
      step: "no_due_date",
      runAt: null,
      contactId: invoice.contact_id,
      projectId: invoice.project_id,
    },
  ];
}

// An unpaid installment of an invoice that has a schedule.
export function installmentSteps(installment: { id: string; due_date: string | null }, invoice: Owner): DesiredJob[] {
  return installment.due_date ? dueDateSteps("installment", installment.id, installment.due_date, invoice) : [];
}

// A contract awaiting signature or a questionnaire not yet answered, by when
// it went out.
export function sentDocumentSteps(
  kind: "contract" | "questionnaire",
  doc: Owner & { id: string; sent_at: string | null },
): DesiredJob[] {
  if (!doc.sent_at) return [];
  const sentDay = businessDay(new Date(doc.sent_at));
  return [3, 7].map((n) => ({
    kind,
    targetId: doc.id,
    step: `day_${n}`,
    runAt: businessMorning(addDays(sentDay, n)),
    contactId: doc.contact_id,
    projectId: doc.project_id,
  }));
}

export type JobStatus = "scheduled" | "running" | "sent" | "skipped" | "canceled" | "failed";

export type ExistingJob = {
  id: string;
  kind: ReminderKind;
  target_id: string;
  step: string;
  run_at: string;
  status: JobStatus;
  attempts: number;
};

export type ReconcilePlan = {
  insert: { kind: ReminderKind; target_id: string; step: string; run_at: string; contact_id: string | null; project_id: string | null }[];
  reschedule: { id: string; run_at: string }[];
  revive: { id: string; run_at: string }[];
  cancel: { id: string; reason: string }[];
};

const jobKey = (kind: string, targetId: string, step: string) => `${kind}|${targetId}|${step}`;

// Moves the queue toward `desired`. `existing` should hold every scheduled
// and canceled job (sent, skipped and failed ones are final; inserting over
// them is ignored by the unique key, so a sent reminder never repeats).
//   * New reminders are added only if their time is still ahead.
//   * A scheduled reminder follows its document's dates (a moved due date
//     moves it) until a send has been tried; a date moved into the past
//     cancels it.
//   * A canceled reminder comes back if it's wanted again and still ahead
//     (reminders switched off and on, an invoice voided then re-sent).
//   * A scheduled reminder nobody wants any more is canceled: the invoice was
//     paid, the contract signed, the questionnaire answered, or reminders of
//     that kind were switched off.
export function planReconcile(desired: DesiredJob[], existing: ExistingJob[], now: Date): ReconcilePlan {
  const plan: ReconcilePlan = { insert: [], reschedule: [], revive: [], cancel: [] };
  const byKey = new Map(existing.map((j) => [jobKey(j.kind, j.target_id, j.step), j]));
  const wanted = new Set<string>();
  const t = now.getTime();

  for (const d of desired) {
    const key = jobKey(d.kind, d.targetId, d.step);
    if (wanted.has(key)) continue;
    wanted.add(key);
    const job = byKey.get(key);

    if (!job) {
      const runAt = d.runAt ?? new Date(t + 7 * DAY);
      if (runAt.getTime() > t) {
        plan.insert.push({
          kind: d.kind,
          target_id: d.targetId,
          step: d.step,
          run_at: runAt.toISOString(),
          contact_id: d.contactId,
          project_id: d.projectId,
        });
      }
      continue;
    }

    if (job.status === "scheduled") {
      if (!d.runAt || job.attempts > 0) continue;
      if (Math.abs(d.runAt.getTime() - Date.parse(job.run_at)) < 60_000) continue;
      if (d.runAt.getTime() > t) plan.reschedule.push({ id: job.id, run_at: d.runAt.toISOString() });
      else plan.cancel.push({ id: job.id, reason: "The date moved into the past" });
      continue;
    }

    if (job.status === "canceled") {
      const runAt = d.runAt ?? new Date(t + 7 * DAY);
      if (runAt.getTime() > t) plan.revive.push({ id: job.id, run_at: runAt.toISOString() });
    }
  }

  for (const job of existing) {
    if (job.status === "scheduled" && !wanted.has(jobKey(job.kind, job.target_id, job.step))) {
      plan.cancel.push({ id: job.id, reason: "No longer needed" });
    }
  }
  return plan;
}

// Wait before trying a failed send again: 1 hour, then 3, then 9.
export function retryDelayMs(attemptsSoFar: number): number {
  return HOUR * 3 ** Math.max(0, attemptsSoFar - 1);
}

export function isStale(runAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(runAt) > STALE_AFTER_MS;
}

// Which template a reminder uses.
export function reminderTemplate(
  kind: ReminderKind,
  step: string,
): "invoice_reminder" | "invoice_overdue" | "contract_reminder" | "questionnaire_reminder" {
  if (kind === "contract") return "contract_reminder";
  if (kind === "questionnaire") return "questionnaire_reminder";
  return step === "overdue" ? "invoice_overdue" : "invoice_reminder";
}
