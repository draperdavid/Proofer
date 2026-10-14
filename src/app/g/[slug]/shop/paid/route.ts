// Stripe sends the client here after a store Checkout succeeds (7.2): clear
// this gallery's cart cookie and show the thank-you. Clearing a cart is all
// it does; the order itself is recorded only by the verified webhook (7.3).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { SLUG_PATTERN } from "@/lib/galleries/viewer-access";
import { cartCookieName } from "@/lib/store/cart";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) return NextResponse.redirect(new URL("/", req.url), 303);
  const res = NextResponse.redirect(new URL(`/g/${slug}?set=shop&cart=paid`, req.url), 303);
  const { data } = await supabaseAdmin().from("collections").select("id").eq("slug", slug).maybeSingle();
  if (data?.id) res.cookies.delete(cartCookieName(data.id as string));
  return res;
}
