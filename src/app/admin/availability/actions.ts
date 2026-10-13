"use server";

// Availability window CRUD. Every action checks requireAdmin() first, then
// uses the service-role client. Validation mirrors the checks in
// 0010_availability.sql.
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isValidTimeZone, parseTimeOfDay } from "@/lib/booking/slots";

export async function createWindow(formData: FormData) {
  await requireAdmin();
  const weekday = Number(formData.get("weekday"));
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error("Pick a weekday");

  const startTime = String(formData.get("start_time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();
  if (parseTimeOfDay(endTime) <= parseTimeOfDay(startTime)) {
    throw new Error("End time must be after start time (windows can't cross midnight — add two windows instead)");
  }

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone || !isValidTimeZone(timezone)) {
    throw new Error(`"${timezone}" is not a valid IANA timezone (e.g. America/Chicago)`);
  }

  const sessionTypeId = String(formData.get("session_type_id") ?? "").trim() || null;

  const db = supabaseAdmin();
  const { error } = await db.from("availability_windows").insert({
    weekday,
    start_time: startTime,
    end_time: endTime,
    timezone,
    session_type_id: sessionTypeId,
  });
  if (error) throw error;

  revalidatePath("/admin/availability");
}

export async function deleteWindow(id: string) {
  await requireAdmin();
  const db = supabaseAdmin();
  const { error } = await db.from("availability_windows").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/availability");
}
