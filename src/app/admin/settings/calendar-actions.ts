"use server";

// Disconnecting Google Calendar (4.5): asks Google to revoke Proofer's
// access, then forgets the tokens. Events already on the calendar stay.
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getLink } from "@/lib/gcal/client";

export async function disconnectCalendar() {
  await requireAdmin();
  const link = await getLink();
  if (link?.refresh_token) {
    // Best effort: if Google is unreachable, forgetting the token here still
    // stops Proofer using it, and David can remove access in his Google account.
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: link.refresh_token }),
    }).catch(() => {});
  }
  const { error } = await supabaseAdmin()
    .from("google_calendar")
    .update({
      refresh_token: null,
      access_token: null,
      access_expires_at: null,
      account_email: null,
      connected_at: null,
      last_error: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw error;
  revalidatePath("/admin/settings");
}
