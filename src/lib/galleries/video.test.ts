// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, playableKeys, posterArgs, posterKey, webCopyArgs, webVideoKey } from "./video.ts";

const ready = {
  collection_id: "c1",
  id: "a1",
  variants_ready: true,
  variants: { web: { key: "collections/c1/a1/web.mp4" }, poster: { key: "collections/c1/a1/poster.jpg" } },
};

test("web copy and poster live under the asset's prefix", () => {
  assert.equal(webVideoKey("c1", "a1"), "collections/c1/a1/web.mp4");
  assert.equal(posterKey("c1", "a1"), "collections/c1/a1/poster.jpg");
});

test("plays only once both files exist at the expected keys", () => {
  assert.deepEqual(playableKeys(ready), { web: "collections/c1/a1/web.mp4", poster: "collections/c1/a1/poster.jpg" });
  assert.equal(playableKeys({ ...ready, variants_ready: false }), null);
  assert.equal(playableKeys({ ...ready, variants: { web: ready.variants.web } }), null);
  // A row pointing at another gallery's file is ignored.
  assert.equal(playableKeys({ ...ready, variants: { ...ready.variants, web: { key: "collections/c2/a9/web.mp4" } } }), null);
});

test("the web copy is browser-safe H.264/AAC that starts playing early", () => {
  const args = webCopyArgs("in.mov", "out.mp4");
  const at = (flag: string) => args[args.indexOf(flag) + 1];
  assert.equal(at("-i"), "in.mov");
  assert.equal(at("-c:v"), "libx264");
  assert.equal(at("-c:a"), "aac");
  assert.equal(at("-movflags"), "+faststart");
  assert.match(at("-vf"), /min\(1920,iw\).*yuv420p/);
  assert.equal(args.at(-1), "out.mp4");
});

test("poster frame is a second in, or halfway through a short clip", () => {
  const at = (d: number) => { const a = posterArgs("v.mp4", "p.jpg", d); return a[a.indexOf("-ss") + 1]; };
  assert.equal(at(60), "1.00");
  assert.equal(at(0.5), "0.25");
  assert.equal(at(0), "0.00");
});

test("formats durations", () => {
  assert.equal(formatDuration(12.4), "0:12");
  assert.equal(formatDuration(247), "4:07");
  assert.equal(formatDuration(3909), "1:05:09");
  assert.equal(formatDuration(null), null);
  assert.equal(formatDuration(-1), null);
});
