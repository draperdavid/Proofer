// Server side of the gallery Shop tab (Phase 7.2): the catalog as clients
// see it, and reading/writing the signed cart cookie.
import { cookies } from "next/headers";
import type { supabaseAdmin } from "@/lib/supabase";
import { accessSecret } from "@/lib/galleries/viewer-access";
import { CART_TTL_SECONDS, cartCookieName, signCart, verifyCart, type CartLine, type StoreProduct, type StoreVariant } from "./cart";

type Db = ReturnType<typeof supabaseAdmin>;

export type ShopProduct = StoreProduct & { slug: string; description: string | null; image_key: string | null };

export async function loadCatalog(db: Db): Promise<{ products: ShopProduct[]; variants: StoreVariant[] }> {
  const [{ data: products, error: pErr }, { data: variants, error: vErr }] = await Promise.all([
    db
      .from("products")
      .select("id, name, slug, description, price_cents, currency, requires_shipping, active, image_key")
      .eq("active", true)
      .order("name"),
    db.from("product_variants").select("id, product_id, name, price_cents, active").eq("active", true).order("position"),
  ]);
  if (pErr) throw pErr;
  if (vErr) throw vErr;
  return { products: (products ?? []) as ShopProduct[], variants: (variants ?? []) as StoreVariant[] };
}

export async function readCart(collectionId: string): Promise<CartLine[]> {
  const secret = accessSecret();
  const token = (await cookies()).get(cartCookieName(collectionId))?.value;
  if (!secret || !token) return [];
  return verifyCart(secret, token, { collectionId, now: Math.floor(Date.now() / 1000) });
}

export async function writeCart(collectionId: string, cart: CartLine[]): Promise<boolean> {
  const secret = accessSecret();
  if (!secret) return false;
  const jar = await cookies();
  if (cart.length === 0) {
    jar.delete(cartCookieName(collectionId));
    return true;
  }
  const expiresAt = Math.floor(Date.now() / 1000) + CART_TTL_SECONDS;
  jar.set(cartCookieName(collectionId), await signCart(secret, collectionId, cart, expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CART_TTL_SECONDS,
  });
  return true;
}
