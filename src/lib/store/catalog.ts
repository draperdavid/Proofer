// Store catalog rules (Phase 7.1). No imports, so Node's test runner can load
// it directly. Checkout (7.2) will use sellableOptions() server-side to decide
// what can be bought and at what price, never the browser's word.

export type CatalogProduct = { price_cents: number; active: boolean };
export type CatalogVariant = { id: string; name: string; price_cents: number | null; active: boolean };

export type SellableOption = { variantId: string | null; label: string | null; priceCents: number };

const MAX_PRICE_CENTS = 100_000_000; // $1,000,000; anything bigger is a typo.

// "12", "12.5", "12.50", "$1,250.00" → cents. Rejects negatives, more than two
// decimals, and anything that isn't a plain amount. Blank → null.
export function parsePriceCents(raw: string): number | null {
  const v = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (v === "") return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) throw new Error(`"${raw.trim()}" isn't a valid price`);
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (cents > MAX_PRICE_CENTS) throw new Error("Price is too large");
  return cents;
}

export function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export function variantPrice(product: CatalogProduct, variant: CatalogVariant): number {
  return variant.price_cents ?? product.price_cents;
}

// What a client could put in a cart. Inactive product → nothing. No variants
// → the product itself. Variants exist → only the active ones (if every
// variant is inactive, nothing is sellable rather than falling back).
export function sellableOptions(product: CatalogProduct, variants: CatalogVariant[]): SellableOption[] {
  if (!product.active) return [];
  if (variants.length === 0) return [{ variantId: null, label: null, priceCents: product.price_cents }];
  return variants
    .filter((v) => v.active)
    .map((v) => ({ variantId: v.id, label: v.name, priceCents: variantPrice(product, v) }));
}

// For the admin list: "$25.00" or "$25.00 – $60.00"; null if nothing sells.
export function priceRange(options: SellableOption[]): { min: number; max: number } | null {
  if (options.length === 0) return null;
  const prices = options.map((o) => o.priceCents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
