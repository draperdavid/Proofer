// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideAccess,
  hashPassword,
  normalizePassword,
  signUnlockToken,
  unlockCookieName,
  validatePassword,
  verifyPassword,
  verifyUnlockToken,
} from "./access.ts";

// Repeated characters so the CI secret scanner doesn't mistake them for real keys.
const SECRET = "a".repeat(40);
const OTHER_SECRET = "b".repeat(40);
const CID = "11111111-2222-3333-4444-555555555555";

test("drafts are never viewable, whatever the visibility or unlock", () => {
  for (const visibility of ["public", "password", "private"]) {
    assert.equal(decideAccess({ status: "draft", visibility }, true), "not_found");
  }
});

test("published galleries: public open, password needs unlock, private closed", () => {
  assert.equal(decideAccess({ status: "published", visibility: "public" }, false), "granted");
  assert.equal(decideAccess({ status: "published", visibility: "password" }, false), "needs_password");
  assert.equal(decideAccess({ status: "published", visibility: "password" }, true), "granted");
  assert.equal(decideAccess({ status: "published", visibility: "private" }, true), "private");
  assert.equal(decideAccess({ status: "published", visibility: "bogus" }, true), "not_found");
});

test("password hash round-trips, is salted, and never contains the password", async () => {
  const a = await hashPassword("smith-wedding");
  const b = await hashPassword("smith-wedding");
  assert.notEqual(a, b);
  assert.ok(!a.includes("smith-wedding"));
  assert.match(a, /^pbkdf2_sha256\$100000\$/);
  assert.equal(await verifyPassword("smith-wedding", a), true);
  assert.equal(await verifyPassword("smith-weddinG", a), false);
  assert.equal(await verifyPassword("", a), false);
});

test("malformed or tampered hashes never verify", async () => {
  const good = await hashPassword("smith-wedding");
  const [scheme, iters, salt, hash] = good.split("$");
  assert.equal(await verifyPassword("smith-wedding", "smith-wedding"), false);
  assert.equal(await verifyPassword("smith-wedding", `md5$${iters}$${salt}$${hash}`), false);
  assert.equal(await verifyPassword("smith-wedding", `${scheme}$1$${salt}$${hash}`), false);
  assert.equal(await verifyPassword("smith-wedding", `${scheme}$999999999$${salt}$${hash}`), false);
  assert.equal(await verifyPassword("smith-wedding", `${scheme}$${iters}$${salt}$${hash.slice(2)}`), false);
});

test("password rules: trimmed, min and max length", () => {
  assert.equal(normalizePassword("  smith-wedding \n"), "smith-wedding");
  assert.throws(() => validatePassword("short"), /at least 6/);
  assert.throws(() => validatePassword("x".repeat(201)), /at most 200/);
  validatePassword("sixsix");
});

test("unlock token works only for its gallery, version, expiry and secret", async () => {
  const now = 1_000_000;
  const token = await signUnlockToken(SECRET, { collectionId: CID, accessVersion: 3, expiresAt: now + 60 });
  const expected = { collectionId: CID, accessVersion: 3, now };

  assert.equal(await verifyUnlockToken(SECRET, token, expected), true);
  assert.equal(await verifyUnlockToken(SECRET, token, { ...expected, collectionId: "other-id" }), false);
  assert.equal(await verifyUnlockToken(SECRET, token, { ...expected, accessVersion: 4 }), false);
  assert.equal(await verifyUnlockToken(SECRET, token, { ...expected, now: now + 60 }), false);
  assert.equal(await verifyUnlockToken(OTHER_SECRET, token, expected), false);
});

test("forged or edited tokens are rejected", async () => {
  const now = 1_000_000;
  const token = await signUnlockToken(SECRET, { collectionId: CID, accessVersion: 1, expiresAt: now + 60 });
  const [cid, version, exp, sig] = token.split(".");
  const expected = { collectionId: CID, accessVersion: 1, now };

  // Pushing the expiry out without re-signing.
  assert.equal(await verifyUnlockToken(SECRET, `${cid}.${version}.${now + 999999}.${sig}`, expected), false);
  assert.equal(await verifyUnlockToken(SECRET, `${cid}.${version}.${exp}.`, expected), false);
  assert.equal(await verifyUnlockToken(SECRET, `${cid}.${version}.${exp}.not+base64`, expected), false);
  assert.equal(await verifyUnlockToken(SECRET, "garbage", expected), false);
});

test("a short secret is refused rather than used", async () => {
  await assert.rejects(
    signUnlockToken("too-short", { collectionId: CID, accessVersion: 1, expiresAt: 1 }),
    /too short/
  );
});

test("cookie name is per gallery and safe", () => {
  assert.equal(unlockCookieName(CID), `gallery_${CID}`);
  assert.equal(unlockCookieName("a;b=c d"), "gallery_abcd");
});
