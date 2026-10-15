// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYBACK_TOKEN_TTL_SECONDS, playerUrl, signPlaybackToken, thumbnailUrl } from "./token.ts";

const UID = "dd5d531a12de0c724bd1275a3b2bc9c6";
const KID = "8f926b2b01f383510025a78a4dcbf6a";

async function makeKey() {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: pair.publicKey, jwkBase64: btoa(JSON.stringify(jwk)) };
}

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

test("signs an RS256 token Stream can verify, for one video, expiring in 6 hours", async () => {
  const { publicKey, jwkBase64 } = await makeKey();
  const token = await signPlaybackToken({ keyId: KID, jwkBase64, videoUid: UID, nowSeconds: 1000 });
  const [h, p, s] = token.split(".");
  assert.deepEqual(decode(h), { alg: "RS256", kid: KID });
  assert.deepEqual(decode(p), { sub: UID, kid: KID, exp: 1000 + PLAYBACK_TOKEN_TTL_SECONDS });
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    Buffer.from(s, "base64url"),
    new TextEncoder().encode(`${h}.${p}`)
  );
  assert.equal(ok, true);
  assert.equal(PLAYBACK_TOKEN_TTL_SECONDS, 21600);
});

test("refuses anything that isn't a Stream video id", async () => {
  const { jwkBase64 } = await makeKey();
  await assert.rejects(signPlaybackToken({ keyId: KID, jwkBase64, videoUid: "../x", nowSeconds: 1 }), /Bad Stream video id/);
});

test("builds player and thumbnail URLs on the account's own Stream host only", () => {
  assert.equal(playerUrl("abc123def456", "TOKEN"), "https://customer-abc123def456.cloudflarestream.com/TOKEN/iframe?preload=metadata");
  assert.equal(
    thumbnailUrl("customer-abc123def456", "TOKEN"),
    "https://customer-abc123def456.cloudflarestream.com/TOKEN/thumbnails/thumbnail.jpg?time=1s&height=640"
  );
  assert.throws(() => playerUrl("evil.com/x", "T"), /CUSTOMER_CODE/);
});
