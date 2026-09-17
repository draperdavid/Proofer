// Supabase clients. Auth and DB live here (Phase 0.3 / 0.4).
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Server-side admin client (service role). Server only, never shipped to the browser.
export function supabaseAdmin() {
  return createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Public (anon) client for browser use, subject to row-level security.
export function supabaseAnon() {
  return createClient(env.supabaseUrl(), env.supabaseAnonKey());
}
