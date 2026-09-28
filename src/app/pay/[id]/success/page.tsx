// Stripe redirects here right after Checkout completes. This page never
// marks anything paid itself — that only happens via the signature-verified
// webhook (task 2.3), which can take a few seconds to arrive. This is just a
// friendly holding message for the client in the meantime.
export default function PaySuccessPage() {
  return (
    <main>
      <h1>Payment submitted</h1>
      <p>Thanks — we&apos;ve received your payment and it&apos;s being confirmed. You&apos;ll get a receipt shortly.</p>
    </main>
  );
}
