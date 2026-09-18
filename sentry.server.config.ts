// Server-side Sentry init, run inside the Cloudflare Worker via src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { env } from "./src/lib/env";

Sentry.init({
  dsn: env.sentryDsn(),
  tracesSampleRate: 0,
});
