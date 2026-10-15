// Google sends David back here after he allows calendar access (4.5). The
// state must match the cookie set by /admin/calendar/connect, so another
// site can't connect someone else's calendar to Proofer.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { emailFromIdToken } from "@/lib/gcal/google";
import { exchangeCode } from "@/lib/gcal/client";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "proofer_gcal_state";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const done = (result: string) => {
    const res = NextResponse.redirect(new URL(`/admin/settings?calendar=${result}#calendar`, request.url), 303);
    res.cookies.set(STATE_COOKIE, "", { path: "/admin/calendar", maxAge: 0 });
    return res;
  };

  const expected = (await cookies()).get(STATE_COOKIE)?.value ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!expected || !constantTimeEqual(state, expected)) return done("bad_state");
  if (url.searchParams.get("error")) return done("declined");
  const code = url.searchParams.get("code");
  if (!code) return done("declined");

  try {
    const tokens = await exchangeCode(code);
    const scopes = (tokens.scope ?? "").split(" ");
    if (!scopes.some((s) => s.endsWith("/calendar.events.owned")) || !scopes.some((s) => s.endsWith("/calendar.freebusy"))) {
      return done("missing_scope");
    }
    if (!tokens.refresh_token) return done("no_refresh");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin()
      .from("google_calendar")
      .upsert({
        id: 1,
        account_email: emailFromIdToken(tokens.id_token),
        calendar_id: "primary",
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        connected_at: now,
        last_error: null,
        last_error_at: null,
        updated_at: now,
      });
    if (error) throw error;
  } catch (err) {
    console.error("google connect failed", err);
    return done("failed");
  }
  return done("connected");
}
