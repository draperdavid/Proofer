// Pure helpers for event-triggered email (Phase 8.2). No imports beyond
// siblings with explicit extensions, so Node's test runner can load it.

// "Jordan Ellis" -> "Jordan". Falls back to the full name for one-word or
// odd input, and to "there" ("Hi there,") when there is no name at all.
export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

// The fields every project-scoped email can fill.
export function projectFields(contactName: string | null | undefined, projectTitle: string | null | undefined) {
  return {
    "contact.first_name": firstName(contactName),
    "contact.name": (contactName ?? "").trim(),
    "project.title": (projectTitle ?? "").trim(),
  };
}

// One key per event, so the same event can never mail a client twice.
// Entering a stage sends once per project, stage and template, even if the
// card is dragged out and back. An invoice resends only if its total changed.
export const idempotencyKeys = {
  stageEntered: (projectId: string, stageId: string, templateKey: string) =>
    `stage:${projectId}:${stageId}:${templateKey}`,
  invoiceSent: (invoiceId: string, totalCents: number) => `invoice_sent:${invoiceId}:${totalCents}`,
  quoteSent: (quoteId: string) => `quote_sent:${quoteId}`,
  questionnaireSent: (questionnaireId: string) => `questionnaire_sent:${questionnaireId}`,
};

// "$1,234.50" from integer cents.
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// "October 20, 2026" from a YYYY-MM-DD date column, read as a calendar date
// (never shifted by a timezone). Blank or malformed input gives "".
export function formatDate(isoDate: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? "");
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

// Joins a base URL and a path without doubling or dropping the slash.
export function absoluteUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
