import * as Sentry from "@sentry/nextjs";

// Cloudflare Workers (via OpenNext) has no real Node `https`/net sockets — only
// `fetch` — regardless of whether Next.js labels a given route "nodejs" or "edge".
// @sentry/nextjs's node-runtime init defaults to an https-based transport, which
// throws "[unenv] https.request is not implemented yet!" under nodejs_compat and
// silently drops every event. The vercel-edge-based init (sentry.edge.config.ts)
// uses a fetch transport and has built-in Cloudflare ctx.waitUntil support, so both
// runtimes route through it here instead of a separate sentry.server.config.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
