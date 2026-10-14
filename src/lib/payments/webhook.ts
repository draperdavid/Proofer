// Pulls what the payment audit needs out of a verified Stripe event (Phase
// 2.3). No imports beyond types, so Node's test runner can load it directly.
import type Stripe from "stripe";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventPayment = {
  invoiceId: string | null;
  sessionId: string | null;
  paymentIntentId: string | null;
  amountCents: number | null;
  currency: string | null;
  // True only for an event that says the money has actually arrived.
  markPaid: boolean;
};

const NONE: EventPayment = {
  invoiceId: null,
  sessionId: null,
  paymentIntentId: null,
  amountCents: null,
  currency: null,
  markPaid: false,
};

const idOf = (v: string | { id: string } | null | undefined) => (v == null ? null : typeof v === "string" ? v : v.id);

// The invoice id our Checkout session carries (pay/[id]/actions.ts sets both
// metadata.invoice_id and client_reference_id). If they disagree, trust neither.
function invoiceIdOf(session: Stripe.Checkout.Session): string | null {
  const meta = session.metadata?.invoice_id ?? null;
  const ref = session.client_reference_id ?? null;
  if (!meta || !UUID_PATTERN.test(meta)) return null;
  if (ref !== null && ref !== meta) return null;
  return meta.toLowerCase();
}

export function paymentFromEvent(event: Stripe.Event): EventPayment {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      const invoiceId = invoiceIdOf(s);
      // "completed" with payment_status "unpaid" is a delayed method (bank
      // debit); the money only counts once async_payment_succeeded arrives.
      const markPaid =
        invoiceId !== null &&
        s.mode === "payment" &&
        ((event.type === "checkout.session.completed" && s.payment_status === "paid") ||
          event.type === "checkout.session.async_payment_succeeded");
      return {
        invoiceId,
        sessionId: s.id,
        paymentIntentId: idOf(s.payment_intent),
        amountCents: s.amount_total ?? null,
        currency: s.currency ?? null,
        markPaid,
      };
    }
    case "charge.refunded": {
      const c = event.data.object as Stripe.Charge;
      return {
        ...NONE,
        paymentIntentId: idOf(c.payment_intent),
        amountCents: c.amount_refunded,
        currency: c.currency,
      };
    }
    default:
      return NONE;
  }
}
