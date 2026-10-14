// Stripe client. Uses Stripe Checkout only.
import Stripe from "stripe";
import { env } from "./env";

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  // The default Node http client relies on node:https, which Workers don't
  // implement, so every call failed with "connection to Stripe". Use fetch.
  if (!_stripe) _stripe = new Stripe(env.stripeSecret(), { httpClient: Stripe.createFetchHttpClient() });
  return _stripe;
}
