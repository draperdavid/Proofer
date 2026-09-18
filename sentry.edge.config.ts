// Sentry init for all server-side code (both Next.js "nodejs" and "edge" runtimes
// route here — see src/instrumentation.ts for why there's no separate server config).
import * as Sentry from "@sentry/nextjs";
import { createTransport } from "@sentry/core";
import type { BaseTransportOptions, TransportMakeRequestResponse } from "@sentry/core";
import { env } from "./src/lib/env";

// Cloudflare Workers (via OpenNext) has no real Node `https`/net sockets — only
// `fetch` — regardless of whether Next.js labels a route "nodejs" or "edge"; the
// enclosing bundle for instrumentation.ts is always compiled for the "nodejs"
// runtime target, so @sentry/nextjs always resolves its Node build here (the
// edge/vercel-edge subpath swap only applies to files Next.js itself compiles
// under the edge runtime, not to a config file we happen to dynamically import).
// The default Node transport uses `https.request`, which nodejs_compat doesn't
// implement, so every event silently fails to send. Force a plain fetch-based
// transport instead, matching @sentry/browser's makeFetchTransport pattern.
function makeCloudflareFetchTransport(options: BaseTransportOptions) {
  return createTransport(options, async (request): Promise<TransportMakeRequestResponse> => {
    const response = await fetch(options.url, {
      method: "POST",
      headers: options.headers,
      body: request.body as BodyInit,
    });
    return {
      statusCode: response.status,
      headers: {
        "x-sentry-rate-limits": response.headers.get("X-Sentry-Rate-Limits"),
        "retry-after": response.headers.get("Retry-After"),
      },
    };
  });
}

Sentry.init({
  dsn: env.sentryDsn(),
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  transport: makeCloudflareFetchTransport,
});
