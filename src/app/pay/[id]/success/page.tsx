// Stripe redirects here right after Checkout completes. This page never
// marks anything paid itself — that only happens via the signature-verified
// webhook (task 2.3), which can take a few seconds to arrive. This is just a
// friendly holding message for the client in the meantime.
export default function PaySuccessPage() {
  return (
    <main>
      <h1>Payment Received</h1>
      <p>Thank you. Your payment is going through now, and a receipt will follow by email.</p>
    </main>
  );
}
