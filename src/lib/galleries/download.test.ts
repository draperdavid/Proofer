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

// ------------------------------------------------------------- 5.5 limits
import {
  downloadFilename,
  downloadKeyFor,
  isClaimRefusal,
  isDownloadSize,
  parseLimit,
  remainingDownloads,
} from "./download.ts";

const asset = {
  collection_id: "c1",
  id: "a1",
  r2_key: "collections/c1/a1/original.jpg",
  variants_ready: true,
  variants: { "2048": { key: "collections/c1/a1/2048.jpg" }, "1024": { key: "collections/other/a1/1024.jpg" } },
};

test("download key: original, ready variant, never a fallback to full-res", () => {
  assert.equal(downloadKeyFor(asset, "original"), "collections/c1/a1/original.jpg");
  assert.equal(downloadKeyFor(asset, "2048"), "collections/c1/a1/2048.jpg");
  assert.equal(downloadKeyFor(asset, "3600"), null);
  // A variant key outside this photo's prefix isn't trusted.
  assert.equal(downloadKeyFor(asset, "1024"), null);
  assert.equal(downloadKeyFor({ ...asset, variants_ready: false }, "2048"), null);
});

test("download sizes and filenames", () => {
  assert.ok(isDownloadSize("original") && isDownloadSize("2048"));
  assert.ok(!isDownloadSize("640") && !isDownloadSize(""));
  assert.equal(downloadFilename("IMG_0042.CR3.jpg", "original"), "IMG_0042.CR3.jpg");
  assert.equal(downloadFilename("IMG_0042.png", "2048"), "IMG_0042-2048.jpg");
  assert.equal(downloadFilename("dir/x", "1024"), "x-1024.jpg");
});

test("limit fields: blank is unlimited, junk is refused", () => {
  assert.equal(parseLimit(""), null);
  assert.equal(parseLimit("  "), null);
  assert.equal(parseLimit("0"), 0);
  assert.equal(parseLimit(" 25 "), 25);
  assert.throws(() => parseLimit("-1"));
  assert.throws(() => parseLimit("2.5"));
  assert.throws(() => parseLimit("1e3"));
});

test("remaining downloads is the tighter limit, never negative", () => {
  assert.equal(remainingDownloads({ galleryLimit: null, galleryUsed: 9, personLimit: null, personUsed: 9 }), null);
  assert.equal(remainingDownloads({ galleryLimit: 25, galleryUsed: 10, personLimit: null, personUsed: 0 }), 15);
  assert.equal(remainingDownloads({ galleryLimit: 25, galleryUsed: 10, personLimit: 5, personUsed: 2 }), 3);
  assert.equal(remainingDownloads({ galleryLimit: 5, galleryUsed: 9, personLimit: 5, personUsed: 0 }), 0);
});

test("claim refusals are known, ok and not_found are not refusals with messages", () => {
  assert.ok(isClaimRefusal("person_limit"));
  assert.ok(!isClaimRefusal("ok"));
  assert.ok(!isClaimRefusal("not_found"));
  assert.ok(!isClaimRefusal("toString"));
});

test("a video downloads as its original whatever the gallery's photo size", () => {
  const video = { kind: "video", collection_id: "c", id: "a", r2_key: "collections/c/a/original.mov", variants_ready: false, variants: {} };
  assert.equal(downloadKeyFor(video, "2048"), "collections/c/a/original.mov");
  assert.equal(downloadKeyFor(video, "original"), "collections/c/a/original.mov");
  // A photo at a size that isn't made yet still refuses (no silent upgrade).
  assert.equal(downloadKeyFor({ ...video, kind: "photo", r2_key: "collections/c/a/original.jpg" }, "2048"), null);
});
