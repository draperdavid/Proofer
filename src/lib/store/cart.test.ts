// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LINES, MAX_QTY, addLine, pricedCart, setLineQty, signCart, verifyCart, type CartLine } from "./cart.ts";

const SECRET = "x".repeat(40);
const G1 = "11111111-1111-4111-8111-111111111111";
const G2 = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const V1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const V2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOW = 1_800_000_000;

test("adding merges the same item, caps quantity and line count", () => {
  let cart: CartLine[] = [];
  cart = addLine(cart, { productId: P1, variantId: V1 }, 2);
  cart = addLine(cart, { productId: P1, variantId: V1 }, 3);
  cart = addLine(cart, { productId: P1, variantId: null }, 1);
  assert.deepEqual(cart, [
    { productId: P1, variantId: V1, qty: 5 },
    { productId: P1, variantId: null, qty: 1 },
  ]);
  assert.equal(addLine(cart, { productId: P1, variantId: V1 }, 999)[0].qty, MAX_QTY);
  const full = Array.from({ length: MAX_LINES }, (_, i) => ({ productId: P2, variantId: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, qty: 1 }));
  assert.equal(addLine(full, { productId: P1, variantId: null }, 1).length, MAX_LINES);
});

test("setting quantity to zero removes the line", () => {
  const cart = [{ productId: P1, variantId: null, qty: 2 }];
  assert.deepEqual(setLineQty(cart, { productId: P1, variantId: null }, 4), [{ productId: P1, variantId: null, qty: 4 }]);
  assert.deepEqual(setLineQty(cart, { productId: P1, variantId: null }, 0), []);
  assert.deepEqual(setLineQty(cart, { productId: P1, variantId: null }, Number.NaN), []);
});

test("the signed cart round-trips and refuses tampering, other galleries and expiry", async () => {
  const cart = [{ productId: P1, variantId: V1, qty: 2 }];
  const token = await signCart(SECRET, G1, cart, NOW + 60);
  assert.deepEqual(await verifyCart(SECRET, token, { collectionId: G1, now: NOW }), cart);
  assert.deepEqual(await verifyCart(SECRET, token, { collectionId: G2, now: NOW }), []);
  assert.deepEqual(await verifyCart(SECRET, token, { collectionId: G1, now: NOW + 61 }), []);
  assert.deepEqual(await verifyCart("y".repeat(40), token, { collectionId: G1, now: NOW }), []);
  const [g, , exp, sig] = token.split(".");
  const forged = `${g}.${Buffer.from(JSON.stringify([[P1, V1, 20]])).toString("base64url")}.${exp}.${sig}`;
  assert.deepEqual(await verifyCart(SECRET, forged, { collectionId: G1, now: NOW }), []);
  assert.deepEqual(await verifyCart(SECRET, "garbage", { collectionId: G1, now: NOW }), []);
});

test("a validly signed cart with bad contents is treated as empty", async () => {
  for (const bad of [[{ productId: "x", variantId: null, qty: 1 }], [{ productId: P1, variantId: null, qty: 0 }], [{ productId: P1, variantId: null, qty: 1.5 }]]) {
    const token = await signCart(SECRET, G1, bad as CartLine[], NOW + 60);
    assert.deepEqual(await verifyCart(SECRET, token, { collectionId: G1, now: NOW }), []);
  }
});

test("pricing reads the catalog and drops anything no longer sellable", () => {
  const products = [
    { id: P1, name: "Print", price_cents: 2500, active: true, currency: "usd", requires_shipping: true },
    { id: P2, name: "Old", price_cents: 1000, active: false, currency: "usd", requires_shipping: false },
  ];
  const variants = [
    { id: V1, product_id: P1, name: "8x10", price_cents: 4000, active: true },
    { id: V2, product_id: P1, name: "4x6", price_cents: null, active: false },
  ];
  const priced = pricedCart(
    [
      { productId: P1, variantId: V1, qty: 2 },
      { productId: P1, variantId: V2, qty: 1 }, // inactive variant
      { productId: P1, variantId: null, qty: 1 }, // has variants: must pick one
      { productId: P2, variantId: null, qty: 1 }, // inactive product
      { productId: P2, variantId: V1, qty: 1 }, // variant of another product
    ],
    products,
    variants
  );
  assert.deepEqual(priced, [
    { productId: P1, variantId: V1, qty: 2, name: "Print", label: "8x10", unitCents: 4000, currency: "usd", requiresShipping: true },
  ]);
});
