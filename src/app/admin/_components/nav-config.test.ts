// Run with `npm test`. Guards the sidebar's active-item rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gallery, inGalleryApp, isOn, studio, studioLeaves } from "./nav-config.ts";

// The names of the Studio Manager items lit up for a given path.
const active = (path: string) => studioLeaves().filter((l) => isOn(l, path)).map((l) => l.name);

test("Home is only active on /admin itself", () => {
  assert.deepEqual(active("/admin"), ["Home"]);
  assert.ok(!active("/admin/projects").includes("Home"));
});

test("Contracts list vs Contract templates are never both active", () => {
  assert.deepEqual(active("/admin/contracts"), ["Contracts"]);
  assert.deepEqual(active("/admin/contracts/abc-123"), ["Contracts"]);
  assert.deepEqual(active("/admin/contracts/templates"), ["Templates"]);
  assert.deepEqual(active("/admin/contracts/templates/xyz"), ["Templates"]);
});

test("Questionnaires list vs Questionnaire templates are never both active", () => {
  assert.deepEqual(active("/admin/questionnaires"), ["Questionnaires"]);
  assert.deepEqual(active("/admin/questionnaires/abc"), ["Questionnaires"]);
  assert.deepEqual(active("/admin/questionnaires/templates"), ["Templates"]);
});

test("Emails belong to the Templates hub", () => {
  assert.deepEqual(active("/admin/emails"), ["Templates"]);
  assert.deepEqual(active("/admin/emails/subject-line"), ["Templates"]);
  assert.deepEqual(active("/admin/emails/log"), ["Templates"]);
});

test("simple sections light up on their pages and sub-pages", () => {
  assert.deepEqual(active("/admin/projects/p1"), ["Projects"]);
  assert.deepEqual(active("/admin/contacts"), ["Contacts"]);
  assert.deepEqual(active("/admin/invoices/i1"), ["Invoices"]);
  assert.deepEqual(active("/admin/quotes/q1"), ["Quotes"]);
  assert.deepEqual(active("/admin/session-types/s1"), ["Session types"]);
  assert.deepEqual(active("/admin/availability"), ["Availability"]);
});

test("a path that merely starts with the same letters does not match", () => {
  assert.deepEqual(active("/admin/contractsfoo"), []);
  assert.deepEqual(active("/admin/projectsarchive"), []);
});

test("galleries and the store belong to the Client Gallery app", () => {
  for (const p of ["/admin/galleries", "/admin/galleries/new", "/admin/galleries/abc", "/admin/store", "/admin/store/p1"]) {
    assert.ok(inGalleryApp(p), p);
  }
  for (const p of ["/admin", "/admin/projects", "/admin/galleriesx", "/admin/storefront"]) {
    assert.ok(!inGalleryApp(p), p);
  }
  assert.ok(isOn(gallery.primary[0], "/admin/galleries/abc"));
  assert.ok(isOn(gallery.tools[0], "/admin/store/p1"));
});

test("every nav link points under /admin and no link is listed twice", () => {
  const hrefs = studioLeaves().map((l) => l.href);
  assert.ok(hrefs.every((h) => h === "/admin" || h.startsWith("/admin/")));
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(studio.tools.every((g) => g.children.length > 0));
});
