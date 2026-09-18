// Edge-runtime Sentry init (middleware.ts runs here), loaded via src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { env } from "./src/lib/env";

Sentry.init({
  dsn: env.sentryDsn(),
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
