// Run with `npm test`. The expected URLs were produced by the AWS SDK's
// getSignedUrl (GetObjectCommand) at this fixed time with these dummy
// credentials, so a pass means presignGetUrl is byte-identical to the SDK.
import { test } from "node:test";
import assert from "node:assert/strict";
import { presignGetUrl } from "./presign.ts";

const base = {
  accountId: "ACCT",
  bucket: "my-bucket",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "SECRETEXAMPLE",
  now: new Date("2026-10-08T12:34:56Z"),
};

test("matches the SDK for a plain GET (space in key)", async () => {
  const url = await presignGetUrl({ ...base, key: "collections/c1/a1/variant 640.jpg", expiresIn: 900 });
  assert.equal(
    url,
    "https://my-bucket.acct.r2.cloudflarestorage.com/collections/c1/a1/variant%20640.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIDEXAMPLE%2F20261008%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261008T123456Z&X-Amz-Expires=900&X-Amz-Signature=0fba5745f1004a3ac453232e574fc01994c6870d7c0e9cbb59c1856391a56095&X-Amz-SignedHeaders=host&x-id=GetObject"
  );
});

test("matches the SDK for a download with Content-Disposition (parens, accent)", async () => {
  const url = await presignGetUrl({
    ...base,
    key: "collections/c1/a1/original.jpg",
    expiresIn: 60,
    responseContentDisposition: 'attachment; filename="Photo (1) é.jpg"',
  });
  assert.equal(
    url,
    "https://my-bucket.acct.r2.cloudflarestorage.com/collections/c1/a1/original.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIDEXAMPLE%2F20261008%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261008T123456Z&X-Amz-Expires=60&X-Amz-Signature=dd7655178b076635cb9f901a69908af05016195e322979ea27cec60bc7fece9d&X-Amz-SignedHeaders=host&response-content-disposition=attachment%3B%20filename%3D%22Photo%20%281%29%20%C3%A9.jpg%22&x-id=GetObject"
  );
});

test("cached signing key gives the same answer on repeat calls, and a new day re-derives", async () => {
  const a = await presignGetUrl({ ...base, key: "k.jpg", expiresIn: 60 });
  const b = await presignGetUrl({ ...base, key: "k.jpg", expiresIn: 60 });
  assert.equal(a, b);
  const nextDay = await presignGetUrl({ ...base, key: "k.jpg", expiresIn: 60, now: new Date("2026-10-09T12:34:56Z") });
  assert.notEqual(a, nextDay);
  assert.match(nextDay, /X-Amz-Date=20261009T123456Z/);
});

test("a different secret changes the signature", async () => {
  const a = await presignGetUrl({ ...base, key: "k.jpg", expiresIn: 60 });
  const b = await presignGetUrl({ ...base, secretAccessKey: "OTHER", key: "k.jpg", expiresIn: 60 });
  assert.notEqual(a, b);
});
