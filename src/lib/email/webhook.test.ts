// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeDeliveryStatus, parseDeliveryEvent, signWebhook, verifyWebhook } from "./webhook.ts";

// Published Svix test vector (the scheme Resend uses).
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TS = "1614265330";
const BODY = '{"test": 2432232314}';
const SIG = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";

test("matches the published signing vector", async () => {
  assert.equal(`v1,${await signWebhook(SECRET, ID, TS, BODY)}`, SIG);
});

test("accepts a valid signature, including among several", async () => {
  const now = Number(TS);
  assert.equal(await verifyWebhook(SECRET, { id: ID, timestamp: TS, signature: SIG }, BODY, now), true);
  assert.equal(
    await verifyWebhook(SECRET, { id: ID, timestamp: TS, signature: `v1,bm90IGl0 ${SIG}` }, BODY, now),
    true
  );
});

test("rejects tampering, wrong secret, missing headers, and replays", async () => {
  const now = Number(TS);
  const h = { id: ID, timestamp: TS, signature: SIG };
  assert.equal(await verifyWebhook(SECRET, h, BODY.replace("2432", "9999"), now), false);
  assert.equal(await verifyWebhook(SECRET, { ...h, id: "msg_other" }, BODY, now), false);
  assert.equal(await verifyWebhook("whsec_" + btoa("a different secret"), h, BODY, now), false);
  assert.equal(await verifyWebhook(SECRET, { ...h, signature: null }, BODY, now), false);
  assert.equal(await verifyWebhook(SECRET, { ...h, signature: SIG.replace("v1", "v2") }, BODY, now), false);
  assert.equal(await verifyWebhook("", h, BODY, now), false);
  assert.equal(await verifyWebhook("whsec_!!!not-base64", h, BODY, now), false);
  // Older or newer than 5 minutes.
  assert.equal(await verifyWebhook(SECRET, h, BODY, now + 301), false);
  assert.equal(await verifyWebhook(SECRET, h, BODY, now - 301), false);
  assert.equal(await verifyWebhook(SECRET, { ...h, timestamp: "abc" }, BODY, now), false);
});

test("parses the events we track and ignores the rest", () => {
  const base = { email_id: "re_1", to: ["Jordan@Example.com"] };
  assert.deepEqual(parseDeliveryEvent({ type: "email.delivered", data: base }), {
    status: "delivered",
    emailId: "re_1",
    recipients: ["jordan@example.com"],
    detail: null,
    suppress: false,
  });
  assert.equal(parseDeliveryEvent({ type: "email.delivery_delayed", data: base })?.status, "delayed");
  const complaint = parseDeliveryEvent({ type: "email.complained", data: base });
  assert.equal(complaint?.status, "complained");
  assert.equal(complaint?.suppress, true);
  assert.equal(parseDeliveryEvent({ type: "email.opened", data: base }), null);
  assert.equal(parseDeliveryEvent({ type: "email.sent", data: base }), null);
  assert.equal(parseDeliveryEvent({ type: "email.delivered", data: { to: ["a@b.co"] } }), null);
  assert.equal(parseDeliveryEvent(null), null);
  assert.equal(parseDeliveryEvent("nope"), null);
});

test("only permanent bounces suppress the address", () => {
  const hard = parseDeliveryEvent({
    type: "email.bounced",
    data: { email_id: "re_2", to: "x@y.co", bounce: { type: "Permanent", subType: "General", message: "No such user" } },
  });
  assert.equal(hard?.suppress, true);
  assert.equal(hard?.detail, "Permanent: General: No such user");
  assert.deepEqual(hard?.recipients, ["x@y.co"]);
  const soft = parseDeliveryEvent({
    type: "email.bounced",
    data: { email_id: "re_3", to: ["x@y.co"], bounce: { type: "Transient", subType: "MailboxFull" } },
  });
  assert.equal(soft?.suppress, false);
  const unknown = parseDeliveryEvent({ type: "email.bounced", data: { email_id: "re_4", to: ["x@y.co"] } });
  assert.equal(unknown?.suppress, true);
  assert.equal(unknown?.detail, "Bounced");
});

test("a late, weaker event never overwrites a worse one", () => {
  assert.equal(mergeDeliveryStatus(null, "delayed"), "delayed");
  assert.equal(mergeDeliveryStatus("delayed", "delivered"), "delivered");
  assert.equal(mergeDeliveryStatus("bounced", "delayed"), "bounced");
  assert.equal(mergeDeliveryStatus("bounced", "delivered"), "bounced");
  assert.equal(mergeDeliveryStatus("delivered", "complained"), "complained");
  assert.equal(mergeDeliveryStatus("complained", "bounced"), "complained");
});
