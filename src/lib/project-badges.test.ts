// Run with `npm test`. Guards the status pills shown on projects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contractBadge, paymentBadge, projectBadges, questionnaireBadge } from "./project-badges.ts";

const TODAY = "2026-10-08";

test("payment: no invoices (or only void ones) shows nothing", () => {
  assert.equal(paymentBadge([], TODAY), null);
  assert.equal(paymentBadge([{ status: "void", due_date: null }], TODAY), null);
});

test("payment: a sent invoice past its due date is Past due, before it is Unpaid", () => {
  assert.deepEqual(paymentBadge([{ status: "sent", due_date: "2026-10-07" }], TODAY), { tone: "red", label: "Past due" });
  assert.deepEqual(paymentBadge([{ status: "sent", due_date: "2026-10-08" }], TODAY), { tone: "blue", label: "Unpaid" });
  assert.deepEqual(paymentBadge([{ status: "sent", due_date: null }], TODAY), { tone: "blue", label: "Unpaid" });
});

test("payment: past due beats unpaid, unpaid beats draft, draft beats paid", () => {
  const pastDue = { status: "sent", due_date: "2026-09-01" };
  const unpaid = { status: "sent", due_date: "2026-12-01" };
  const draft = { status: "draft", due_date: null };
  const paid = { status: "paid", due_date: null };
  assert.equal(paymentBadge([unpaid, pastDue, paid], TODAY)?.label, "Past due");
  assert.equal(paymentBadge([draft, unpaid, paid], TODAY)?.label, "Unpaid");
  assert.equal(paymentBadge([paid, draft], TODAY)?.label, "Invoice draft");
  assert.deepEqual(paymentBadge([paid, paid], TODAY), { tone: "green", label: "Paid" });
});

test("payment: a void invoice never changes the result", () => {
  assert.deepEqual(paymentBadge([{ status: "paid", due_date: null }, { status: "void", due_date: "2026-01-01" }], TODAY), {
    tone: "green",
    label: "Paid",
  });
});

test("contract: most urgent status wins, canceled is ignored", () => {
  assert.equal(contractBadge([]), null);
  assert.equal(contractBadge([{ status: "canceled" }]), null);
  assert.equal(contractBadge([{ status: "completed" }, { status: "awaiting_signature" }])?.label, "Awaiting signature");
  assert.equal(contractBadge([{ status: "draft" }, { status: "in_progress" }])?.label, "Signing in progress");
  assert.equal(contractBadge([{ status: "completed" }, { status: "draft" }])?.label, "Contract draft");
  assert.deepEqual(contractBadge([{ status: "completed" }, { status: "canceled" }]), { tone: "green", label: "Signed" });
});

test("questionnaire: pending if any is unanswered, done only when all are answered", () => {
  assert.equal(questionnaireBadge([]), null);
  assert.equal(questionnaireBadge([{ submitted_at: null }, { submitted_at: "2026-10-01T00:00:00Z" }])?.label, "Questionnaire pending");
  assert.deepEqual(questionnaireBadge([{ submitted_at: "2026-10-01T00:00:00Z" }]), { tone: "green", label: "Questionnaire done" });
});

test("projectBadges lists payment, then contract, then questionnaire, skipping empty ones", () => {
  const all = projectBadges(
    {
      invoices: [{ status: "sent", due_date: "2026-12-01" }],
      contracts: [{ status: "completed" }],
      questionnaires: [{ submitted_at: null }],
    },
    TODAY
  );
  assert.deepEqual(all.map((b) => b.label), ["Unpaid", "Signed", "Questionnaire pending"]);
  assert.deepEqual(projectBadges({ invoices: [], contracts: [], questionnaires: [] }, TODAY), []);
});
