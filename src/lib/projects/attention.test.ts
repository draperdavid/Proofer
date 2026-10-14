// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionItems, daysBetween, dollars, type AttentionInput } from "./attention.ts";

const TODAY = "2026-10-14";
const base = (o: Partial<AttentionInput> = {}): AttentionInput => ({
  projects: [
    { id: "p1", title: "Smith family", stage_id: "booked", event_date: "2026-10-17", location: "Forsyth Park", created_at: "2026-09-20T12:00:00Z" },
    { id: "p2", title: "J. Ortiz", stage_id: "inquiry", event_date: null, location: null, created_at: "2026-10-13T12:00:00Z" },
    { id: "p3", title: "Old lead", stage_id: "inquiry", event_date: null, location: null, created_at: "2026-08-01T12:00:00Z" },
  ],
  invoices: [],
  installments: [],
  contracts: [],
  questionnaires: [],
  firstStageId: "inquiry",
  today: TODAY,
  ...o,
});
const keyed = (items: ReturnType<typeof attentionItems>) => items.map((i) => `${i.split}:${i.label}:${i.title}`);

test("helpers", () => {
  assert.equal(daysBetween("2026-10-08", TODAY), 6);
  assert.equal(dollars(45000), "$450");
  assert.equal(dollars(19260), "$192.60");
});

test("new inquiries are recent first-stage projects with nothing sent; sessions within 7 days are this week", () => {
  assert.deepEqual(keyed(attentionItems(base())).sort(), ["needs:New inquiry:J. Ortiz", "week:Session:Smith family"]);
});

test("an overdue invoice needs you; an unpaid one not yet due waits on the client", () => {
  const items = attentionItems(
    base({
      invoices: [
        { id: "i1", project_id: "p1", status: "sent", due_date: "2026-10-08", total_cents: 45000, created_at: "2026-10-01T00:00:00Z" },
        { id: "i2", project_id: "p1", status: "sent", due_date: "2026-10-20", total_cents: 10000, created_at: "2026-10-01T00:00:00Z" },
        { id: "i3", project_id: "p1", status: "paid", due_date: "2026-10-01", total_cents: 5000, created_at: "2026-10-01T00:00:00Z" },
      ],
    })
  );
  const late = items.find((i) => i.label === "Overdue")!;
  assert.equal(late.split, "needs");
  assert.equal(late.detail, "$450 · due Oct 8");
  assert.equal(late.when, "6 days");
  assert.equal(late.href, "/admin/invoices/i1");
  const open = items.find((i) => i.label === "Unpaid")!;
  assert.equal(open.split, "waiting");
  assert.equal(open.detail, "$100 due Oct 20");
  assert.ok(!items.some((i) => i.key.includes("i3")));
});

test("scheduled invoices count only unpaid installments, each by its own date", () => {
  const items = attentionItems(
    base({
      invoices: [{ id: "i1", project_id: "p1", status: "sent", due_date: "2026-11-01", total_cents: 53500, created_at: "2026-10-01T00:00:00Z" }],
      installments: [
        { invoice_id: "i1", amount_cents: 16050, due_date: "2026-10-01", status: "paid" },
        { invoice_id: "i1", amount_cents: 10000, due_date: "2026-10-10", status: "unpaid" },
        { invoice_id: "i1", amount_cents: 27450, due_date: null, status: "unpaid" },
      ],
    })
  );
  assert.equal(items.find((i) => i.label === "Overdue")!.detail, "$100 · due Oct 10");
});

test("drafts need finishing; sent contracts and open questionnaires wait on the client; touched inquiries drop off", () => {
  const items = attentionItems(
    base({
      invoices: [{ id: "i9", project_id: "p2", status: "draft", due_date: null, total_cents: 19260, created_at: "2026-10-12T00:00:00Z" }],
      contracts: [
        { id: "c1", project_id: "p1", status: "awaiting_signature", sent_at: "2026-10-09T15:00:00Z", created_at: "2026-10-08T00:00:00Z" },
        { id: "c2", project_id: "p1", status: "completed", sent_at: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" },
      ],
      questionnaires: [
        { id: "q1", project_id: "p1", submitted_at: null, created_at: "2026-10-11T00:00:00Z" },
        { id: "q2", project_id: "p1", submitted_at: "2026-10-12T00:00:00Z", created_at: "2026-10-10T00:00:00Z" },
      ],
    })
  );
  assert.deepEqual(keyed(items).sort(), [
    "needs:Invoice draft:J. Ortiz",
    "waiting:Questionnaire out:Smith family",
    "waiting:Unsigned:Smith family",
    "week:Session:Smith family",
  ]);
  assert.equal(items.find((i) => i.label === "Unsigned")!.when, "5 days");
});
