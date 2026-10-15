"use server";

// Booking changes David controls (Phase 4.4). Only cancel: confirming is the
// webhook's job and the database refuses anything else (migration 0024).
// Canceling frees the time; any refund is done in Stripe by hand.
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-admin";
import { syncBookingQuietly } from "@/lib/gcal/client";

export async function cancelBooking(id: string) {
  await requireAdmin();
  const { error } = await supabaseAdmin()
    .from("bookings")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending_payment", "confirmed"]);
  if (error) throw error;
  // Off the Google Calendar too (4.5); the hourly job retries on failure.
  await syncBookingQuietly(id);
  revalidatePath("/admin/bookings");
}
