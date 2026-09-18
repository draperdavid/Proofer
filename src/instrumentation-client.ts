// Browser Sentry init. Static process.env.NEXT_PUBLIC_X reference required here
// (see src/lib/supabase/client.ts) so Next.js inlines the DSN into the client bundle.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
