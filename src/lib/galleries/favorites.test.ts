// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, signVisitorToken, verifyVisitorToken, visitorCookieName } from "./favorites.ts";

// Repeated characters so the CI secret scanner doesn't mistake them for real keys.
const SECRET = "a".repeat(40);
const OTHER_SECRET = "b".repeat(40);
const CID = "11111111-2222-3333-4444-555555555555";

test("emails are trimmed, lowercased, and must look like an email", () => {
  assert.equal(normalizeEmail("  Jane.Doe+wed@Example.COM \n"), "jane.doe+wed@example.com");
  assert.equal(normalizeEmail("first_last@example.com"), "first_last@example.com");
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail("no-at-sign"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail("two@@example.com"), null);
  assert.equal(normalizeEmail("sp ace@example.com"), null);
  assert.equal(normalizeEmail(`${"x".repeat(250)}@example.com`), null);
});

test("visitor token returns the email only for its gallery, expiry and secret", async () => {
  const now = 1_000_000;
  const token = await signVisitorToken(SECRET, { collectionId: CID, email: "jane@example.com", expiresAt: now + 60 });
  const expected = { collectionId: CID, now };

  assert.equal(await verifyVisitorToken(SECRET, token, expected), "jane@example.com");
  assert.equal(await verifyVisitorToken(SECRET, token, { ...expected, collectionId: "other-id" }), null);
  assert.equal(await verifyVisitorToken(SECRET, token, { ...expected, now: now + 60 }), null);
  assert.equal(await verifyVisitorToken(OTHER_SECRET, token, expected), null);
});

test("a tampered visitor token never verifies", async () => {
  const now = 1_000_000;
  const token = await signVisitorToken(SECRET, { collectionId: CID, email: "jane@example.com", expiresAt: now + 60 });
  const [cid, , exp, sig] = token.split(".");
  const swapped = `${cid}.${Buffer.from("mallory@example.com").toString("base64url")}.${exp}.${sig}`;

  assert.equal(await verifyVisitorToken(SECRET, swapped, { collectionId: CID, now }), null);
  assert.equal(await verifyVisitorToken(SECRET, `${cid}.x.${Number(exp) + 999}.${sig}`, { collectionId: CID, now }), null);
  assert.equal(await verifyVisitorToken(SECRET, "garbage", { collectionId: CID, now }), null);
  assert.equal(await verifyVisitorToken(SECRET, `${token}.extra`, { collectionId: CID, now }), null);
});

test("cookie name only carries safe characters", () => {
  assert.equal(visitorCookieName(CID), `gfav_${CID}`);
  assert.equal(visitorCookieName("a;b=c"), "gfav_abc");
});
