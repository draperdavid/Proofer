// Gallery store cart (Phase 7.2). The cart lives in a signed cookie per
// gallery and holds only ids and quantities, never prices: checkout re-reads
// every line from the database (pricedCart below). Pure apart from
// WebCrypto, so the test runner can load it.
import { decodeText, encodeText, signPayload, verifyPayload } from "../galleries/access.ts";
import { sellableOptions, type CatalogProduct, type CatalogVariant } from "./catalog.ts";

export type CartLine = { productId: string; variantId: string | null; qty: number };

export const MAX_LINES = 20;
export const MAX_QTY = 20;
export const CART_TTL_SECONDS = 30 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function cartCookieName(collectionId: string): string {
  return `gcart_${collectionId.replace(/[^a-zA-Z0-9-]/g, "")}`;
}

const sameItem = (a: { productId: string; variantId: string | null }, b: { productId: string; variantId: string | null }) =>
  a.productId === b.productId && a.variantId === b.variantId;

function clampQty(qty: number): number {
  return Math.max(1, Math.min(MAX_QTY, Math.floor(qty)));
}

// Adds qty of an item, merging with an existing line. Returns the cart
// unchanged if it's already at MAX_LINES and this is a new item.
export function addLine(cart: CartLine[], item: { productId: string; variantId: string | null }, qty: number): CartLine[] {
  const existing = cart.find((l) => sameItem(l, item));
  if (existing) return cart.map((l) => (l === existing ? { ...l, qty: clampQty(l.qty + qty) } : l));
  if (cart.length >= MAX_LINES) return cart;
  return [...cart, { ...item, qty: clampQty(qty) }];
}

// qty 0 or less removes the line.
export function setLineQty(cart: CartLine[], item: { productId: string; variantId: string | null }, qty: number): CartLine[] {
  if (!(qty >= 1)) return cart.filter((l) => !sameItem(l, item));
  return cart.map((l) => (sameItem(l, item) ? { ...l, qty: clampQty(qty) } : l));
}

function isLine(v: unknown): v is CartLine {
  const l = v as CartLine;
  return (
    typeof l === "object" && l !== null &&
    typeof l.productId === "string" && UUID.test(l.productId) &&
    (l.variantId === null || (typeof l.variantId === "string" && UUID.test(l.variantId))) &&
    Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= MAX_QTY
  );
}

// `<collectionId>.<base64url json>.<expiresAt>.<hmac>`, bound to one gallery.
export async function signCart(secret: string, collectionId: string, cart: CartLine[], expiresAt: number): Promise<string> {
  const payload = `${collectionId}.${encodeText(JSON.stringify(cart.map((l) => [l.productId, l.variantId, l.qty])))}.${expiresAt}`;
  return `${payload}.${await signPayload(secret, payload)}`;
}

// The cart, or [] for anything malformed, forged, expired or from another gallery.
export async function verifyCart(secret: string, token: string, expected: { collectionId: string; now: number }): Promise<CartLine[]> {
  const parts = token.split(".");
  if (parts.length !== 4) return [];
  const [collectionId, body, expiresAt, sig] = parts;
  if (!(await verifyPayload(secret, `${collectionId}.${body}.${expiresAt}`, sig))) return [];
  if (collectionId !== expected.collectionId || !(Number(expiresAt) > expected.now)) return [];
  const json = decodeText(body);
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw) || raw.length > MAX_LINES) return [];
    const lines = raw.map((r) => (Array.isArray(r) ? { productId: r[0], variantId: r[1], qty: r[2] } : null));
    return lines.every(isLine) ? (lines as CartLine[]) : [];
  } catch {
    return [];
  }
}

export type StoreProduct = CatalogProduct & { id: string; name: string; currency: string; requires_shipping: boolean };
export type StoreVariant = CatalogVariant & { product_id: string };
export type PricedLine = CartLine & { name: string; label: string | null; unitCents: number; currency: string; requiresShipping: boolean };

// Prices every line from the catalog as it is now. Lines whose product or
// variant is gone, inactive, or doesn't belong to that product are dropped.
export function pricedCart(cart: CartLine[], products: StoreProduct[], variants: StoreVariant[]): PricedLine[] {
  const priced: PricedLine[] = [];
  for (const line of cart) {
    const product = products.find((p) => p.id === line.productId);
    if (!product) continue;
    const options = sellableOptions(product, variants.filter((v) => v.product_id === product.id));
    const option = options.find((o) => o.variantId === line.variantId);
    if (!option) continue;
    priced.push({
      ...line,
      name: product.name,
      label: option.label,
      unitCents: option.priceCents,
      currency: product.currency,
      requiresShipping: product.requires_shipping,
    });
  }
  return priced;
}
