// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentDisposition, isUuid } from "./download.ts";

test("accepts only well-formed uuids", () => {
  assert.ok(isUuid("3f2b8c1e-9a4d-4e7f-8b2a-1c0d9e8f7a6b"));
  assert.ok(!isUuid("not-a-uuid"));
  assert.ok(!isUuid("3f2b8c1e-9a4d-4e7f-8b2a-1c0d9e8f7a6b' or 1=1"));
  assert.ok(!isUuid(""));
});

test("a plain filename passes through as an attachment", () => {
  assert.equal(
    attachmentDisposition("IMG_0042.jpg"),
    `attachment; filename="IMG_0042.jpg"; filename*=UTF-8''IMG_0042.jpg`
  );
});

test("quotes, paths and control characters can't break the header", () => {
  const value = attachmentDisposition('../../a"b\r\nX-Evil: 1.jpg');
  assert.ok(!value.includes("\r") && !value.includes("\n"));
  assert.match(value, /^attachment; filename="[^"]*"; filename\*=UTF-8''\S+$/);
  assert.ok(!value.includes(".."));
});

test("non-ASCII names keep a safe fallback plus the UTF-8 form", () => {
  const value = attachmentDisposition("Café día.jpg");
  assert.ok(value.includes(`filename="Caf_ d_a.jpg"`));
  assert.ok(value.includes("filename*=UTF-8''Caf%C3%A9%20d%C3%ADa.jpg"));
});

test("an empty name falls back to photo", () => {
  assert.ok(attachmentDisposition("").includes(`filename="photo"`));
  assert.ok(attachmentDisposition("dir/").includes(`filename="photo"`));
});
