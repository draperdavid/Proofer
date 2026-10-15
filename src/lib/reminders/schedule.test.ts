// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ATTEMPTS,
  addDays,
  businessDay,
  businessMorning,
  installmentSteps,
  invoiceSteps,
  isStale,
  planReconcile,
  reminderTemplate,
  retryDelayMs,
  sentDocumentSteps,
  type DesiredJob,
  type ExistingJob,
} from "./schedule.ts";
import { TEMPLATES } from "../email/templates.ts";
import { cronToken, verifyCronToken } from "./cron-auth.ts";

const owner = { contact_id: "c1", project_id: "p1" };
const iso = (d: Date | null) => d?.toISOString() ?? null;

test("addDays is calendar arithmetic across month and year ends", () => {
  assert.equal(addDays("2026-10-20", -3), "2026-10-17");
  assert.equal(addDays("2026-10-30", 7), "2026-11-06");
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  assert.throws(() => addDays("10/20/2026", 1));
});

test("businessMorning is 10 AM Eastern on both sides of DST", () => {
  // EDT (UTC-4) and EST (UTC-5).
  assert.equal(businessMorning("2026-10-20").toISOString(), "2026-10-20T14:00:00.000Z");
  assert.equal(businessMorning("2026-12-01").toISOString(), "2026-12-01T15:00:00.000Z");
  // DST change days themselves.
  assert.equal(businessMorning("2026-03-08").toISOString(), "2026-03-08T14:00:00.000Z");
  assert.equal(businessMorning("2026-11-01").toISOString(), "2026-11-01T15:00:00.000Z");
});

test("businessDay reads the Eastern calendar day, not UTC's", () => {
  // 01:30 UTC on the 15th is still the evening of the 14th in Georgia.
  assert.equal(businessDay(new Date("2026-10-15T01:30:00Z")), "2026-10-14");
  assert.equal(businessDay(new Date("2026-10-15T14:00:00Z")), "2026-10-15");
});

test("an invoice with a due date gets before, on and after reminders", () => {
  const steps = invoiceSteps({ id: "i1", due_date: "2026-10-20", ...owner });
  assert.deepEqual(
    steps.map((s) => [s.kind, s.step, iso(s.runAt)]),
    [
      ["invoice", "before_due", "2026-10-17T14:00:00.000Z"],
      ["invoice", "due", "2026-10-20T14:00:00.000Z"],
      ["invoice", "overdue", "2026-10-27T14:00:00.000Z"],
    ],
  );
  assert.equal(steps[0].contactId, "c1");
  assert.equal(steps[0].projectId, "p1");
});

test("an invoice without a due date gets one floating reminder", () => {
  const steps = invoiceSteps({ id: "i1", due_date: null, ...owner });
  assert.deepEqual(steps.map((s) => [s.step, s.runAt]), [["no_due_date", null]]);
});

test("installments follow their own due date, and none without one", () => {
  const steps = installmentSteps({ id: "n1", due_date: "2026-11-01" }, owner);
  assert.deepEqual(steps.map((s) => [s.kind, s.targetId, s.step]), [
    ["installment", "n1", "before_due"],
    ["installment", "n1", "due"],
    ["installment", "n1", "overdue"],
  ]);
  assert.deepEqual(installmentSteps({ id: "n2", due_date: null }, owner), []);
});

test("contracts and questionnaires get day 3 and day 7, from the Eastern send day", () => {
  // Sent 9 PM Eastern on Oct 14 (01:00 UTC Oct 15): counts from the 14th.
  const steps = sentDocumentSteps("contract", { id: "k1", sent_at: "2026-10-15T01:00:00Z", ...owner });
  assert.deepEqual(steps.map((s) => [s.step, iso(s.runAt)]), [
    ["day_3", "2026-10-17T14:00:00.000Z"],
    ["day_7", "2026-10-21T14:00:00.000Z"],
  ]);
  assert.deepEqual(sentDocumentSteps("contract", { id: "k2", sent_at: null, ...owner }), []);
});

const NOW = new Date("2026-10-15T12:00:00Z");

function desired(step: string, runAt: string | null, targetId = "i1"): DesiredJob {
  return { kind: "invoice", targetId, step, runAt: runAt ? new Date(runAt) : null, contactId: "c1", projectId: "p1" };
}

function existing(step: string, runAt: string, status: ExistingJob["status"], attempts = 0, targetId = "i1"): ExistingJob {
  return { id: `${targetId}-${step}`, kind: "invoice", target_id: targetId, step, run_at: runAt, status, attempts };
}

test("reconcile queues only reminders still ahead (no catch-up backlog)", () => {
  const plan = planReconcile(
    [desired("before_due", "2026-10-14T14:00:00Z"), desired("due", "2026-10-17T14:00:00Z")],
    [],
    NOW,
  );
  assert.deepEqual(plan.insert.map((j) => [j.step, j.run_at]), [["due", "2026-10-17T14:00:00.000Z"]]);
  assert.equal(plan.insert[0].contact_id, "c1");
  assert.deepEqual(plan.cancel, []);
});

test("reconcile gives a floating reminder a week from first sight and then leaves it", () => {
  const first = planReconcile([desired("no_due_date", null)], [], NOW);
  assert.deepEqual(first.insert.map((j) => j.run_at), ["2026-10-22T12:00:00.000Z"]);
  const later = planReconcile(
    [desired("no_due_date", null)],
    [existing("no_due_date", "2026-10-22T12:00:00.000Z", "scheduled")],
    new Date("2026-10-16T12:00:00Z"),
  );
  assert.deepEqual(later, { insert: [], reschedule: [], revive: [], cancel: [] });
});

test("reconcile moves a scheduled reminder when the due date moves", () => {
  const plan = planReconcile(
    [desired("due", "2026-10-25T14:00:00Z")],
    [existing("due", "2026-10-20T14:00:00.000Z", "scheduled")],
    NOW,
  );
  assert.deepEqual(plan.reschedule, [{ id: "i1-due", run_at: "2026-10-25T14:00:00.000Z" }]);
});

test("reconcile cancels a reminder whose date moved into the past", () => {
  const plan = planReconcile(
    [desired("due", "2026-10-14T14:00:00Z")],
    [existing("due", "2026-10-20T14:00:00.000Z", "scheduled")],
    NOW,
  );
  assert.deepEqual(plan.cancel, [{ id: "i1-due", reason: "The date moved into the past" }]);
  assert.deepEqual(plan.reschedule, []);
});

test("reconcile leaves a retrying reminder's backoff time alone", () => {
  const plan = planReconcile(
    [desired("due", "2026-10-15T14:00:00Z")],
    [existing("due", "2026-10-15T15:00:00.000Z", "scheduled", 1)],
    NOW,
  );
  assert.deepEqual(plan, { insert: [], reschedule: [], revive: [], cancel: [] });
});

test("reconcile cancels reminders nobody wants (paid, signed, switched off)", () => {
  const plan = planReconcile(
    [],
    [existing("due", "2026-10-20T14:00:00.000Z", "scheduled"), existing("before_due", "2026-10-12T14:00:00.000Z", "canceled")],
    NOW,
  );
  assert.deepEqual(plan.cancel, [{ id: "i1-due", reason: "No longer needed" }]);
  assert.deepEqual(plan.revive, []);
});

test("reconcile revives a canceled reminder only if it's still ahead", () => {
  const plan = planReconcile(
    [desired("due", "2026-10-20T14:00:00Z"), desired("before_due", "2026-10-14T14:00:00Z")],
    [existing("due", "2026-10-20T14:00:00.000Z", "canceled"), existing("before_due", "2026-10-14T14:00:00.000Z", "canceled")],
    NOW,
  );
  assert.deepEqual(plan.revive, [{ id: "i1-due", run_at: "2026-10-20T14:00:00.000Z" }]);
  assert.deepEqual(plan.insert, []);
});

test("reconcile ignores duplicate desired entries", () => {
  const d = desired("due", "2026-10-20T14:00:00Z");
  assert.equal(planReconcile([d, d], [], NOW).insert.length, 1);
});

test("retries back off 1h, 3h, 9h and give up after MAX_ATTEMPTS", () => {
  const h = 60 * 60 * 1000;
  assert.deepEqual([1, 2, 3].map(retryDelayMs), [h, 3 * h, 9 * h]);
  assert.equal(MAX_ATTEMPTS, 4);
});

test("a reminder more than two days late is stale", () => {
  assert.equal(isStale("2026-10-13T11:00:00Z", NOW), true);
  assert.equal(isStale("2026-10-13T13:00:00Z", NOW), false);
});

test("each reminder maps to a template that can fill it", () => {
  assert.equal(reminderTemplate("invoice", "before_due"), "invoice_reminder");
  assert.equal(reminderTemplate("installment", "due"), "invoice_reminder");
  assert.equal(reminderTemplate("invoice", "overdue"), "invoice_overdue");
  assert.equal(reminderTemplate("installment", "overdue"), "invoice_overdue");
  assert.equal(reminderTemplate("invoice", "no_due_date"), "invoice_reminder");
  assert.equal(reminderTemplate("contract", "day_3"), "contract_reminder");
  assert.equal(reminderTemplate("questionnaire", "day_7"), "questionnaire_reminder");
  for (const key of ["invoice_reminder", "invoice_overdue"] as const) {
    assert.deepEqual([...TEMPLATES[key].fields].sort(), [
      "contact.first_name",
      "contact.name",
      "invoice.amount",
      "invoice.due_date",
      "invoice.link",
    ]);
  }
});

test("the cron token is stable, secret-bound and checked exactly", async () => {
  const a = await cronToken("secret-one");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await cronToken("secret-one"));
  assert.notEqual(a, await cronToken("secret-two"));
  assert.equal(await verifyCronToken("secret-one", a), true);
  assert.equal(await verifyCronToken("secret-two", a), false);
  assert.equal(await verifyCronToken("secret-one", a.slice(0, 63)), false);
  assert.equal(await verifyCronToken("secret-one", ""), false);
});
