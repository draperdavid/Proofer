// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, assetPrefix, collectionPrefix, mediaKind, originalKey, validateUpload } from "./media-rules.ts";

test("accepts JPEG, PNG and WebP with the right extension", () => {
  assert.equal(validateUpload({ name: "a.jpeg", type: "image/jpeg", size: 10 }), "jpg");
  assert.equal(validateUpload({ name: "a.png", type: "image/png", size: 10 }), "png");
  assert.equal(validateUpload({ name: "a.webp", type: "image/webp", size: 10 }), "webp");
});

test("rejects other types, including HEIC and an empty type", () => {
  assert.throws(() => validateUpload({ name: "a.heic", type: "image/heic", size: 10 }), /only JPEG/);
  assert.throws(() => validateUpload({ name: "a.avi", type: "video/x-msvideo", size: 10 }), /only JPEG/);
  assert.throws(() => validateUpload({ name: "a", type: "", size: 10 }), /only JPEG/);
});

test("rejects empty, fractional and oversized files", () => {
  assert.throws(() => validateUpload({ name: "a.jpg", type: "image/jpeg", size: 0 }), /empty/);
  assert.throws(() => validateUpload({ name: "a.jpg", type: "image/jpeg", size: 1.5 }), /empty/);
  assert.throws(() => validateUpload({ name: "a.jpg", type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 }), /100 MB/);
  assert.equal(validateUpload({ name: "a.jpg", type: "image/jpeg", size: MAX_UPLOAD_BYTES }), "jpg");
});

test("keys nest asset under collection so prefix deletes cover everything", () => {
  const key = originalKey("c1", "a1", "jpg");
  assert.equal(key, "collections/c1/a1/original.jpg");
  assert.ok(key.startsWith(assetPrefix("c1", "a1")));
  assert.ok(assetPrefix("c1", "a1").startsWith(collectionPrefix("c1")));
});

test("the client's filename never reaches the key", () => {
  const key = originalKey("c1", "a1", validateUpload({ name: "../../evil.jpg", type: "image/jpeg", size: 5 }));
  assert.equal(key, "collections/c1/a1/original.jpg");
});

test("accepts MP4, MOV and WebM videos up to 5 GB", () => {
  assert.equal(validateUpload({ name: "film.mp4", type: "video/mp4", size: 10 }), "mp4");
  assert.equal(validateUpload({ name: "film.mov", type: "video/quicktime", size: 10 }), "mov");
  assert.equal(validateUpload({ name: "film.webm", type: "video/webm", size: 10 }), "webm");
  assert.equal(validateUpload({ name: "film.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES }), "mp4");
  assert.throws(() => validateUpload({ name: "film.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES + 1 }), /5 GB/);
  // The photo cap doesn't apply to videos, and vice versa.
  assert.equal(validateUpload({ name: "film.mp4", type: "video/mp4", size: MAX_UPLOAD_BYTES + 1 }), "mp4");
});

test("tells photos from videos by type", () => {
  assert.equal(mediaKind("image/jpeg"), "photo");
  assert.equal(mediaKind("video/quicktime"), "video");
  assert.equal(mediaKind("application/pdf"), null);
  assert.equal(mediaKind("constructor"), null);
});
