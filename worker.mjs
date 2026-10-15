// Worker entry point (wrangler.toml `main`). Requests go straight to the
// Worker that `opennextjs-cloudflare build` generates; this file only adds a
// cron trigger (Phase 8.3) that runs the reminder queue through the app's own
// /api/cron/reminders route, so the reminder code runs inside Next like every
// other route. Plain .mjs so `next build` doesn't type-check it before
// .open-next/ exists.
import openNext from "./.open-next/worker.js";
import { CRON_HEADER, cronToken } from "./src/lib/reminders/cron-auth.ts";

export default {
  fetch: openNext.fetch,

  async scheduled(_controller, env, ctx) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("reminder cron: SUPABASE_SERVICE_ROLE_KEY isn't set");
      return;
    }
    const base = env.APP_BASE_URL || "https://localhost";
    const request = new Request(new URL("/api/cron/reminders", base), {
      method: "POST",
      headers: { [CRON_HEADER]: await cronToken(env.SUPABASE_SERVICE_ROLE_KEY) },
    });
    const response = await openNext.fetch(request, env, ctx);
    const body = await response.text();
    // A thrown error marks this cron run failed in the Cloudflare dashboard.
    if (!response.ok) throw new Error(`reminder cron: ${response.status} ${body.slice(0, 500)}`);
    console.log(`reminder cron: ${body.slice(0, 500)}`);
  },
};
