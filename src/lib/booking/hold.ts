// How long a time is held for a client who has picked it but not paid yet,
// and how long each Stripe Checkout session lives. Stripe's shortest
// Checkout expiry is 30 minutes; opening Checkout extends the hold past it,
// so a payment can never land after its hold has lapsed (bookings take card
// only, so there are no delayed payment methods either).
export const BOOKING_HOLD_MINUTES = 40;
export const CHECKOUT_EXPIRY_MINUTES = 30;
export const HOLD_PAST_CHECKOUT_MINUTES = 5;
