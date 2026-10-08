// Run with `npm test`. Guards how the Inbox folders and labels work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FOLDERS, countFolders, folderOf, inFolder, isFolderKey, mailPill } from "./inbox.ts";

const m = (status: string, delivery_status: string | null = null) => ({ status, delivery_status });

test("every email lands in exactly one folder", () => {
  assert.equal(folderOf(m("sent", "delivered")), "delivered");
  assert.equal(folderOf(m("sent")), "sent");
  assert.equal(folderOf(m("sent", "delayed")), "sent");
  assert.equal(folderOf(m("pending")), "sent");
  assert.equal(folderOf(m("skipped")), "skipped");
  assert.equal(folderOf(m("failed")), "attention");
});

test("bounces and spam complaints need attention even though the send succeeded", () => {
  assert.equal(folderOf(m("sent", "bounced")), "attention");
  assert.equal(folderOf(m("sent", "complained")), "attention");
});

test("attention wins over skipped and delivered", () => {
  assert.equal(folderOf(m("failed", "delivered")), "attention");
  assert.equal(folderOf(m("skipped", "bounced")), "attention");
});

test("inFolder: all contains everything, others only their own", () => {
  const rows = [m("sent", "delivered"), m("sent"), m("failed"), m("skipped")];
  assert.equal(rows.filter((r) => inFolder(r, "all")).length, 4);
  assert.equal(rows.filter((r) => inFolder(r, "delivered")).length, 1);
  assert.equal(rows.filter((r) => inFolder(r, "attention")).length, 1);
  assert.equal(rows.filter((r) => inFolder(r, "sent")).length, 1);
});

test("counts add up: the four folders sum to all mail", () => {
  const rows = [m("sent", "delivered"), m("sent", "delivered"), m("sent"), m("failed"), m("sent", "bounced"), m("skipped")];
  const c = countFolders(rows);
  assert.deepEqual(c, { all: 6, delivered: 2, sent: 1, attention: 2, skipped: 1 });
  assert.equal(c.delivered + c.sent + c.attention + c.skipped, c.all);
  assert.deepEqual(countFolders([]), { all: 0, delivered: 0, sent: 0, attention: 0, skipped: 0 });
});

test("labels: one clear pill per email", () => {
  assert.deepEqual(mailPill(m("sent", "delivered")), { tone: "green", label: "Delivered" });
  assert.deepEqual(mailPill(m("sent")), { tone: "blue", label: "Sent" });
  assert.deepEqual(mailPill(m("sent", "delayed")), { tone: "amber", label: "Delayed" });
  assert.deepEqual(mailPill(m("sent", "bounced")), { tone: "red", label: "Bounced" });
  assert.deepEqual(mailPill(m("sent", "complained")), { tone: "red", label: "Spam complaint" });
  assert.deepEqual(mailPill(m("failed")), { tone: "red", label: "Failed" });
  assert.deepEqual(mailPill(m("skipped")), { tone: "grey", label: "Not sent" });
  assert.deepEqual(mailPill(m("pending")), { tone: "grey", label: "Sending" });
});

test("folder keys are validated", () => {
  assert.ok(FOLDERS.every((f) => isFolderKey(f.key)));
  assert.ok(!isFolderKey("trash") && !isFolderKey(undefined) && !isFolderKey("__proto__"));
});
