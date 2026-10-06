// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToInput, parsePriceCents, priceRange, sellableOptions, variantPrice } from "./catalog.ts";

test("prices parse to exact integer cents", () => {
  assert.equal(parsePriceCents("12"), 1200);
  assert.equal(parsePriceCents("12.5"), 1250);
  assert.equal(parsePriceCents("12.50"), 1250);
  assert.equal(parsePriceCents("0.07"), 7);
  assert.equal(parsePriceCents(" $1,250.99 "), 125099);
  assert.equal(parsePriceCents("19.99"), 1999); // no float drift
  assert.equal(parsePriceCents("0"), 0);
  assert.equal(parsePriceCents("   "), null);
});

test("bad prices are rejected, not guessed", () => {
  for (const bad of ["-5", "12.345", "abc", "1e3", "12.", ".50", "12,50.0.0", "NaN", "Infinity"]) {
    assert.throws(() => parsePriceCents(bad), /valid price/, bad);
  }
  assert.throws(() => parsePriceCents("1000000.01"), /too large/);
});

test("cents round-trip to the form input", () => {
  assert.equal(centsToInput(1250), "12.50");
  assert.equal(centsToInput(7), "0.07");
  assert.equal(centsToInput(null), "");
  assert.equal(parsePriceCents(centsToInput(1999)), 1999);
});

const product = { price_cents: 2500, active: true };
const v = (id: string, price_cents: number | null, active = true) => ({ id, name: id, price_cents, active });

test("variants inherit the product price unless they set their own", () => {
  assert.equal(variantPrice(product, v("a", null)), 2500);
  assert.equal(variantPrice(product, v("b", 0)), 0);
  assert.equal(variantPrice(product, v("c", 6000)), 6000);
});

test("sellable options: no variants sells the product, variants sell only active ones", () => {
  assert.deepEqual(sellableOptions(product, []), [{ variantId: null, label: null, priceCents: 2500 }]);
  assert.deepEqual(sellableOptions(product, [v("8x10", null), v("16x20", 6000), v("old", 100, false)]), [
    { variantId: "8x10", label: "8x10", priceCents: 2500 },
    { variantId: "16x20", label: "16x20", priceCents: 6000 },
  ]);
  // All variants off means nothing is sellable, not "fall back to the product".
  assert.deepEqual(sellableOptions(product, [v("x", null, false)]), []);
  assert.deepEqual(sellableOptions({ ...product, active: false }, []), []);
});

test("price range spans the sellable options", () => {
  assert.equal(priceRange([]), null);
  assert.deepEqual(priceRange(sellableOptions(product, [v("a", null), v("b", 6000)])), { min: 2500, max: 6000 });
});
