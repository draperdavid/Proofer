// Stripe client. Wired but not exercised until Phase 2. Uses Stripe Checkout only.
import Stripe from "stripe";
import { env } from "./env";

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(env.stripeSecret());
  return _stripe;
}
