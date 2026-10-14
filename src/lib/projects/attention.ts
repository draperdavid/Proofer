// The Projects page's action lists (2026-10-14 restyle, layout "C2"): what
// needs David, what is waiting on the client, and what is on this week. Pure,
// so the rules can be tested; the page loads the rows and renders the items.
//
// Every item links to the record where the action lives. Nothing here sends
// anything: reminders by email come once email is set up.

export type Tone = "red" | "amber" | "blue" | "grey";
export type Split = "needs" | "waiting" | "week";

export type AttentionItem = {
  split: Split;
  key: string;
  projectId: string;
  title: string;
  tone: Tone;
  label: string;
  detail: string;
  when: string; // short, human: "6 days", "Oct 24"
  action: string;
  href: string;
  sort: number; // lower first
};

export type AProject = { id: string; title: string; stage_id: string | null; event_date: string | null; location: string | null; created_at: string };
export type AInvoice = { id: string; project_id: string; status: string; due_date: string | null; total_cents: number; created_at: string };
export type AInstallment = { invoice_id: string; amount_cents: number; due_date: string | null; status: string };
export type AContract = { id: string; project_id: string; status: string; sent_at: string | null; created_at: string };
export type AQuestionnaire = { id: string; project_id: string; submitted_at: string | null; created_at: string };

export type AttentionInput = {
  projects: AProject[];
  invoices: AInvoice[];
  installments: AInstallment[];
  contracts: AContract[];
  questionnaires: AQuestionnaire[];
  firstStageId: string | null;
  today: string; // YYYY-MM-DD, business time zone
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function shortDay(isoDate: string): string {
  const [, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function ago(from: string, today: string): string {
  const n = daysBetween(from.slice(0, 10), today);
  if (n <= 0) return "Today";
  if (n === 1) return "1 day";
  return `${n} days`;
}

export function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

// What is still owed on a sent invoice, and the earliest due date among it.
function owed(inv: AInvoice, schedule: AInstallment[]): { cents: number; due: string | null }[] {
  if (schedule.length === 0) return [{ cents: inv.total_cents, due: inv.due_date }];
  return schedule.filter((i) => i.status !== "paid").map((i) => ({ cents: i.amount_cents, due: i.due_date ?? inv.due_date }));
}

export function attentionItems(input: AttentionInput): AttentionItem[] {
  const { projects, invoices, installments, contracts, questionnaires, firstStageId, today } = input;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const items: AttentionItem[] = [];

  for (const inv of invoices) {
    const p = byId.get(inv.project_id);
    if (!p) continue;
    const href = `/admin/invoices/${inv.id}`;
    if (inv.status === "draft") {
      items.push({ split: "needs", key: `inv-draft-${inv.id}`, projectId: p.id, title: p.title, tone: "grey", label: "Invoice draft", detail: `${dollars(inv.total_cents)} · not sent yet`, when: ago(inv.created_at, today), action: "Finish", href, sort: 3 });
      continue;
    }
    if (inv.status !== "sent") continue;
    const due = owed(inv, installments.filter((i) => i.invoice_id === inv.id));
    const late = due.filter((d) => d.due !== null && d.due < today);
    if (late.length > 0) {
      const cents = late.reduce((s, d) => s + d.cents, 0);
      const oldest = late.map((d) => d.due as string).sort()[0];
      const days = daysBetween(oldest, today);
      items.push({ split: "needs", key: `inv-late-${inv.id}`, projectId: p.id, title: p.title, tone: "red", label: "Overdue", detail: `${dollars(cents)} · due ${shortDay(oldest)}`, when: days === 1 ? "1 day" : `${days} days`, action: "View invoice", href, sort: 0 });
    } else if (due.length > 0) {
      const next = due.map((d) => d.due).filter((d): d is string => d !== null).sort()[0] ?? null;
      const cents = next ? due.filter((d) => d.due === next).reduce((s, d) => s + d.cents, 0) : due.reduce((s, d) => s + d.cents, 0);
      items.push({ split: "waiting", key: `inv-open-${inv.id}`, projectId: p.id, title: p.title, tone: "blue", label: "Unpaid", detail: next ? `${dollars(cents)} due ${shortDay(next)}` : `${dollars(cents)} due on receipt`, when: next ? shortDay(next) : "", action: "View invoice", href, sort: 1 });
    }
  }

  for (const c of contracts) {
    const p = byId.get(c.project_id);
    if (!p) continue;
    const href = `/admin/contracts/${c.id}`;
    if (c.status === "draft") {
      items.push({ split: "needs", key: `con-draft-${c.id}`, projectId: p.id, title: p.title, tone: "grey", label: "Contract draft", detail: "Not sent yet", when: ago(c.created_at, today), action: "Finish", href, sort: 3 });
    } else if (c.status === "awaiting_signature") {
      const sent = c.sent_at ?? c.created_at;
      items.push({ split: "waiting", key: `con-out-${c.id}`, projectId: p.id, title: p.title, tone: "amber", label: "Unsigned", detail: `Contract sent ${shortDay(sent)}`, when: ago(sent, today), action: "View contract", href, sort: 0 });
    }
  }

  for (const q of questionnaires) {
    const p = byId.get(q.project_id);
    if (!p || q.submitted_at) continue;
    items.push({ split: "waiting", key: `q-out-${q.id}`, projectId: p.id, title: p.title, tone: "amber", label: "Questionnaire out", detail: `Sent ${shortDay(q.created_at)}`, when: ago(q.created_at, today), action: "View form", href: `/admin/questionnaires/${q.id}`, sort: 2 });
  }

  // A new inquiry: still in the first stage, under two weeks old, nothing sent yet.
  const touched = new Set([...invoices.map((i) => i.project_id), ...contracts.map((c) => c.project_id)]);
  for (const p of projects) {
    if (firstStageId && p.stage_id === firstStageId && !touched.has(p.id) && daysBetween(p.created_at.slice(0, 10), today) <= 14) {
      items.push({ split: "needs", key: `inq-${p.id}`, projectId: p.id, title: p.title, tone: "blue", label: "New inquiry", detail: p.event_date ? `Wants ${shortDay(p.event_date)}` : "No date yet", when: ago(p.created_at, today), action: "Open", href: `/admin/projects/${p.id}`, sort: 2 });
    }
    if (p.event_date && p.event_date >= today && daysBetween(today, p.event_date) <= 7) {
      items.push({ split: "week", key: `wk-${p.id}`, projectId: p.id, title: p.title, tone: "grey", label: "Session", detail: p.location ? `${shortDay(p.event_date)} · ${p.location}` : shortDay(p.event_date), when: daysBetween(today, p.event_date) === 0 ? "Today" : shortDay(p.event_date), action: "Open", href: `/admin/projects/${p.id}`, sort: daysBetween(today, p.event_date) });
    }
  }

  return items.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}
