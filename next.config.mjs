import { withSentryConfig } from "@sentry/nextjs";

// Security headers on every response (launch hardening, 9.4). The content
// security policy starts in report-only mode: browsers log what it would
// block (DevTools console) without blocking anything. Once a few days pass
// with nothing important reported, switch CSP_ENFORCE to true.
const CSP_ENFORCE = false;

const csp = [
  "default-src 'self'",
  // Next.js inlines small bootstrap scripts, and the theme picker runs one
  // before first paint, so inline scripts stay allowed for now.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Gallery photos and product images are presigned R2 URLs.
  "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
  "media-src 'self' blob: https://*.r2.cloudflarestorage.com",
  // Browser uploads go straight to R2; errors go to Sentry.
  "connect-src 'self' https://*.r2.cloudflarestorage.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  // Pay buttons send the client on to Stripe Checkout.
  "form-action 'self' https://checkout.stripe.com",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: CSP_ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});
