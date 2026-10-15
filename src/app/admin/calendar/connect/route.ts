// Starts connecting David's Google Calendar (4.5): a random state goes in a
// short-lived cookie and to Google; the callback only accepts it back.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { authUrl } from "@/lib/gcal/google";
import { googleConfigured, redirectUri } from "@/lib/gcal/client";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "proofer_gcal_state";

export async function GET(request: Request) {
  await requireAdmin();
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/admin/settings?calendar=not_configured#calendar", request.url), 303);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const state = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "");
  const res = NextResponse.redirect(authUrl({ clientId: process.env.GOOGLE_CLIENT_ID!, redirectUri: redirectUri(), state }), 303);
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/admin/calendar", maxAge: 600 });
  return res;
}
