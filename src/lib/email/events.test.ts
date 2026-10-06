// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteUrl, firstName, formatCents, formatDate, idempotencyKeys, projectFields } from "./events.ts";
import { STAGE_TEMPLATE_KEYS, TEMPLATES, isStageTemplate } from "./templates.ts";

test("firstName takes the first word and never leaves the greeting empty", () => {
  assert.equal(firstName("Jordan Ellis"), "Jordan");
  assert.equal(firstName("  Ana   María López "), "Ana");
  assert.equal(firstName("Cher"), "Cher");
  assert.equal(firstName(""), "there");
  assert.equal(firstName("   "), "there");
  assert.equal(firstName(null), "there");
});

test("projectFields fills exactly the stage-email fields", () => {
  const fields = projectFields(" Jordan Ellis ", " Ellis Family ");
  assert.deepEqual(fields, {
    "contact.first_name": "Jordan",
    "contact.name": "Jordan Ellis",
    "project.title": "Ellis Family",
  });
  for (const key of STAGE_TEMPLATE_KEYS) {
    for (const f of TEMPLATES[key].fields) assert.ok(f in fields, `${key} needs ${f}`);
  }
});

test("only templates a project can fill are stage templates", () => {
  assert.deepEqual([...STAGE_TEMPLATE_KEYS].sort(), ["inquiry_received", "project_booked", "project_wrapped"]);
  assert.equal(isStageTemplate("gallery_ready"), false);
  assert.equal(isStageTemplate("invoice_sent"), false);
});

test("idempotency keys separate events and repeat for the same event", () => {
  const a = idempotencyKeys.stageEntered("p1", "s1", "project_booked");
  assert.equal(a, idempotencyKeys.stageEntered("p1", "s1", "project_booked"));
  assert.notEqual(a, idempotencyKeys.stageEntered("p1", "s2", "project_booked"));
  assert.notEqual(a, idempotencyKeys.stageEntered("p2", "s1", "project_booked"));
  assert.notEqual(a, idempotencyKeys.stageEntered("p1", "s1", "project_wrapped"));
  // A changed invoice total is a new event; the same total is not.
  assert.equal(idempotencyKeys.invoiceSent("i1", 45000), idempotencyKeys.invoiceSent("i1", 45000));
  assert.notEqual(idempotencyKeys.invoiceSent("i1", 45000), idempotencyKeys.invoiceSent("i1", 50000));
  assert.notEqual(idempotencyKeys.quoteSent("x"), idempotencyKeys.questionnaireSent("x"));
});

test("formatCents and formatDate read the way a client expects", () => {
  assert.equal(formatCents(19260), "$192.60");
  assert.equal(formatCents(123450), "$1,234.50");
  assert.equal(formatCents(0), "$0.00");
  assert.equal(formatDate("2026-10-20"), "October 20, 2026");
  // Calendar date, never shifted a day by a timezone.
  assert.equal(formatDate("2026-01-01"), "January 1, 2026");
  assert.equal(formatDate(null), "");
  assert.equal(formatDate("10/20/2026"), "");
});

test("absoluteUrl joins with exactly one slash", () => {
  assert.equal(absoluteUrl("https://x.dev", "/pay/1"), "https://x.dev/pay/1");
  assert.equal(absoluteUrl("https://x.dev/", "pay/1"), "https://x.dev/pay/1");
  assert.equal(absoluteUrl("https://x.dev//", "//pay/1"), "https://x.dev/pay/1");
});
