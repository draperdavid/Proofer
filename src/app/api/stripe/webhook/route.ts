// Stripe webhook endpoint. Fully wired in Phase 2. The ONLY thing that may mark an invoice paid.
// It verifies the Stripe signature; never trust the browser for payment state.
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const body = await req.text();
  try {
    const event = stripe().webhooks.constructEvent(body, sig, env.stripeWebhookSecret());
    // Phase 2: handle event.type (checkout.session.completed, etc.) and mark invoices paid.
    return NextResponse.json({ received: true, type: event.type });
  } catch (e) {
    return NextResponse.json({ error: `invalid signature: ${String(e)}` }, { status: 400 });
  }
}
