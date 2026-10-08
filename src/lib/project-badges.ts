// Status pills for a project, worked out from its invoices, contracts and
// questionnaires. Pure so the rules can be tested. Order: payment, contract,
// questionnaire. A pill only appears when there is something to say.

export type Tone = "green" | "amber" | "blue" | "red" | "grey";
export type Badge = { tone: Tone; label: string };

export type ProjectDocs = {
  invoices: { status: string; due_date: string | null }[];
  contracts: { status: string }[];
  questionnaires: { submitted_at: string | null }[];
};

// today is "YYYY-MM-DD"; due dates are compared as plain strings.
export function paymentBadge(invoices: ProjectDocs["invoices"], today: string): Badge | null {
  const live = invoices.filter((i) => i.status !== "void");
  if (live.length === 0) return null;
  const sent = live.filter((i) => i.status === "sent");
  if (sent.some((i) => i.due_date !== null && i.due_date < today)) return { tone: "red", label: "Past due" };
  if (sent.length > 0) return { tone: "blue", label: "Unpaid" };
  if (live.some((i) => i.status === "draft")) return { tone: "grey", label: "Invoice draft" };
  return { tone: "green", label: "Paid" };
}

export function contractBadge(contracts: ProjectDocs["contracts"]): Badge | null {
  const live = contracts.filter((c) => c.status !== "canceled");
  if (live.some((c) => c.status === "awaiting_signature")) return { tone: "blue", label: "Awaiting signature" };
  if (live.some((c) => c.status === "in_progress")) return { tone: "amber", label: "Signing in progress" };
  if (live.some((c) => c.status === "draft")) return { tone: "grey", label: "Contract draft" };
  if (live.some((c) => c.status === "completed")) return { tone: "green", label: "Signed" };
  return null;
}

export function questionnaireBadge(questionnaires: ProjectDocs["questionnaires"]): Badge | null {
  if (questionnaires.length === 0) return null;
  if (questionnaires.some((q) => q.submitted_at === null)) return { tone: "blue", label: "Questionnaire pending" };
  return { tone: "green", label: "Questionnaire done" };
}

export function projectBadges(docs: ProjectDocs, today: string): Badge[] {
  return [paymentBadge(docs.invoices, today), contractBadge(docs.contracts), questionnaireBadge(docs.questionnaires)].filter(
    (b): b is Badge => b !== null
  );
}
