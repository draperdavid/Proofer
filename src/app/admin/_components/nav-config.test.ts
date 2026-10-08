// Run with `npm test`. Guards the bottom bar's layout and active-item rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BAR, MORE_GROUPS, activeKey, allHrefs } from "./nav-config.ts";

test("bar is six items with Projects in slot 4, so with More it is 3 | Projects | 3", () => {
  assert.deepEqual(
    BAR.map((b) => b.key),
    ["contacts", "finance", "galleries", "projects", "inbox", "documents"]
  );
  assert.equal(BAR[3].key, "projects");
  assert.ok(BAR[3].center);
  assert.equal(BAR.filter((b) => b.center).length, 1);
  // 3 before the center, 2 after + More = 3 after.
  assert.equal(BAR.slice(0, 3).length, 3);
  assert.equal(BAR.slice(4).length + 1, 3);
});

test("each main section lights its own slot", () => {
  assert.equal(activeKey("/admin/contacts"), "contacts");
  assert.equal(activeKey("/admin/contacts/c1"), "contacts");
  assert.equal(activeKey("/admin/projects/p1"), "projects");
  assert.equal(activeKey("/admin/invoices"), "finance");
  assert.equal(activeKey("/admin/invoices/new"), "finance");
  assert.equal(activeKey("/admin/galleries/g1"), "galleries");
});

test("Documents covers contracts, questionnaires and quotes, but not their templates", () => {
  for (const p of ["/admin/contracts", "/admin/contracts/c1", "/admin/questionnaires", "/admin/questionnaires/q1", "/admin/quotes", "/admin/quotes/q1"]) {
    assert.equal(activeKey(p), "documents", p);
  }
  for (const p of ["/admin/contracts/templates", "/admin/contracts/templates/t1", "/admin/questionnaires/templates"]) {
    assert.equal(activeKey(p), "more", p);
  }
});

test("Inbox is the email log; the other email pages are templates under More", () => {
  assert.equal(activeKey("/admin/emails/log"), "inbox");
  assert.equal(activeKey("/admin/emails"), "more");
  assert.equal(activeKey("/admin/emails/booking-confirmation"), "more");
});

test("bookings and the store live under More", () => {
  assert.equal(activeKey("/admin/session-types"), "more");
  assert.equal(activeKey("/admin/session-types/s1"), "more");
  assert.equal(activeKey("/admin/availability"), "more");
  assert.equal(activeKey("/admin/store"), "more");
  assert.equal(activeKey("/admin/store/p1"), "more");
  assert.equal(activeKey("/admin/settings"), "more");
});

test("Home lights nothing, and unknown paths light nothing", () => {
  assert.equal(activeKey("/admin"), null);
  assert.equal(activeKey("/admin/nope"), null);
  assert.equal(activeKey("/admin/contractsfoo"), null);
  assert.equal(activeKey("/admin/projectsarchive"), null);
});

test("every link points under /admin and no destination is listed twice", () => {
  const hrefs = allHrefs();
  assert.ok(hrefs.every((h) => h === "/admin" || h.startsWith("/admin/")));
  // Documents and Contracts-templates differ, so all hrefs are unique.
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(MORE_GROUPS.every((g) => g.links.length > 0));
});
