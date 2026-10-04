// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { VARIANT_SIZES, displayKey, variantKey } from "./variants.ts";
import { assetPrefix, originalKey } from "./media-rules.ts";
import { renderVariants } from "./render-variants.ts";

test("variant keys sit under the asset prefix, so 5.1's deletes remove them", () => {
  for (const size of VARIANT_SIZES) {
    const key = variantKey("c1", "a1", size);
    assert.ok(key.startsWith(assetPrefix("c1", "a1")));
    assert.notEqual(key, originalKey("c1", "a1", "jpg"));
  }
  assert.equal(variantKey("c1", "a1", 640), "collections/c1/a1/640.jpg");
});

const base = { collection_id: "c1", id: "a1", r2_key: "collections/c1/a1/original.jpg" };

test("displayKey falls back to the original until variants are ready", () => {
  const variants = { "640": { key: variantKey("c1", "a1", 640), width: 640, height: 427 } };
  assert.equal(displayKey({ ...base, variants_ready: false, variants }, 640), base.r2_key);
  assert.equal(displayKey({ ...base, variants_ready: true, variants }, 640), "collections/c1/a1/640.jpg");
  assert.equal(displayKey({ ...base, variants_ready: true, variants }, 2048), base.r2_key);
  assert.equal(displayKey({ ...base, variants_ready: true, variants: null }, 640), base.r2_key);
});

test("displayKey ignores a stored key outside the asset's own prefix", () => {
  const variants = { "640": { key: "collections/other/x/640.jpg", width: 640, height: 427 } };
  assert.equal(displayKey({ ...base, variants_ready: true, variants }, 640), base.r2_key);
});

test("renderVariants makes every size as JPEG at the expected dimensions", async () => {
  const input = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#808080" } })
    .jpeg()
    .toBuffer();
  const out = await renderVariants(input, VARIANT_SIZES);
  assert.deepEqual(
    out.map((v) => [v.size, v.width, v.height]),
    [
      [3600, 3600, 2700],
      [2048, 2048, 1536],
      [1024, 1024, 768],
      [640, 640, 480],
    ]
  );
  for (const v of out) assert.equal((await sharp(v.data).metadata()).format, "jpeg");
});

test("renderVariants applies EXIF orientation and strips metadata", async () => {
  // Stored landscape, tagged "rotate 90" — should come out portrait.
  const input = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#808080" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const [v] = await renderVariants(input, [640]);
  assert.deepEqual([v.width, v.height], [427, 640]);
  const meta = await sharp(v.data).metadata();
  assert.equal(meta.orientation, undefined);
  assert.equal(meta.exif, undefined);
});

test("renderVariants flattens transparent PNGs and never upscales", async () => {
  const input = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer();
  const [v] = await renderVariants(input, [3600]);
  const meta = await sharp(v.data).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height, meta.hasAlpha], ["jpeg", 300, 200, false]);
  const { data } = await sharp(v.data).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 240, "transparent pixels become white, not black");
});
