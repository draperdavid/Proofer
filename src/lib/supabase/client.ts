// Browser Supabase client (auth-aware, cookie-based session).
//
// NEXT_PUBLIC_* vars must be referenced as static `process.env.NEXT_PUBLIC_X`
// literals here (not via env.ts's dynamic process.env[name] lookup) — Next.js's
// build-time inlining for client bundles only rewrites statically-analyzable
// member access, so a dynamic lookup silently resolves to undefined in the browser.
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
