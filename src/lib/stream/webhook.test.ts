// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { formatDuration, parseStreamVideo, signStreamWebhook, verifyStreamWebhook } from "./webhook.ts";

const SECRET = "not-a-real-secret";
const TIME = "1230811200";
const BODY = '{"uid":"dd5d531a12de0c724bd1275a3b2bc9c6","readyToStream":true}\n';
const UID = "dd5d531a12de0c724bd1275a3b2bc9c6";

// Independent reference: Node's own HMAC, the way Cloudflare's docs show it.
const expected = createHmac("sha256", SECRET).update(`${TIME}.${BODY}`).digest("hex");

test("signs the way Cloudflare's docs describe", async () => {
  assert.equal(await signStreamWebhook(SECRET, TIME, BODY), expected);
});

test("accepts a valid, recent delivery", async () => {
  assert.equal(await verifyStreamWebhook(SECRET, `time=${TIME},sig1=${expected}`, BODY, Number(TIME) + 5), true);
  assert.equal(await verifyStreamWebhook(SECRET, `time=${TIME}, sig1=${expected.toUpperCase()}`, BODY, Number(TIME)), true);
});

test("refuses forged, tampered, replayed and malformed deliveries", async () => {
  const now = Number(TIME);
  const header = `time=${TIME},sig1=${expected}`;
  assert.equal(await verifyStreamWebhook(SECRET, header, BODY.replace("true", "false"), now), false);
  assert.equal(await verifyStreamWebhook("wrong-secret", header, BODY, now), false);
  assert.equal(await verifyStreamWebhook(SECRET, header, BODY, now + 11 * 60), false);
  assert.equal(await verifyStreamWebhook(SECRET, header, BODY, now - 11 * 60), false);
  // The timestamp is part of what's signed, so it can't be refreshed.
  const fresh = String(now + 3600);
  assert.equal(await verifyStreamWebhook(SECRET, `time=${fresh},sig1=${expected}`, BODY, now + 3600), false);
  assert.equal(await verifyStreamWebhook(SECRET, null, BODY, now), false);
  assert.equal(await verifyStreamWebhook(SECRET, `sig1=${expected}`, BODY, now), false);
  assert.equal(await verifyStreamWebhook(SECRET, `time=${TIME}`, BODY, now), false);
  assert.equal(await verifyStreamWebhook(SECRET, `time=${TIME},sig1=abc`, BODY, now), false);
  assert.equal(await verifyStreamWebhook("", header, BODY, now), false);
});

test("reads a ready video", () => {
  assert.deepEqual(
    parseStreamVideo({ uid: UID, readyToStream: true, status: { state: "ready" }, duration: 65.5, input: { width: 1920, height: 1080 } }),
    { uid: UID, status: "ready", error: null, durationSeconds: 65.5, width: 1920, height: 1080 }
  );
});

test("reads in-progress states, with Stream's -1 placeholders as unknown", () => {
  const base = { uid: UID, readyToStream: false, duration: -1, input: { width: -1, height: -1 } };
  assert.equal(parseStreamVideo({ ...base, status: { state: "downloading" } })?.status, "queued");
  assert.equal(parseStreamVideo({ ...base, status: { state: "queued" } })?.status, "queued");
  const p = parseStreamVideo({ ...base, status: { state: "inprogress" } });
  assert.equal(p?.status, "processing");
  assert.equal(p?.durationSeconds, null);
  assert.equal(p?.width, null);
});

test("reads errors under either field name Stream's docs use", () => {
  assert.equal(
    parseStreamVideo({ uid: UID, status: { state: "error", errorReasonCode: "ERR_NON_VIDEO" } })?.error,
    "Stream says this file isn't a video."
  );
  assert.equal(
    parseStreamVideo({ uid: UID, status: { state: "error", errReasonCode: "ERR_SOMETHING", errReasonText: "Odd" } })?.error,
    "Odd"
  );
  assert.equal(parseStreamVideo({ uid: UID, status: { state: "error" } })?.error, "Stream couldn't process this video.");
});

test("ignores payloads without a real video id", () => {
  assert.equal(parseStreamVideo(null), null);
  assert.equal(parseStreamVideo({}), null);
  assert.equal(parseStreamVideo({ uid: "../../etc" }), null);
  assert.equal(parseStreamVideo({ uid: 42 }), null);
});

test("formats durations", () => {
  assert.equal(formatDuration(12.4), "0:12");
  assert.equal(formatDuration(247), "4:07");
  assert.equal(formatDuration(3909), "1:05:09");
  assert.equal(formatDuration(null), null);
  assert.equal(formatDuration(-1), null);
});
