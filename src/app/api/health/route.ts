// Health check: proves the app can reach Supabase (Phase 0.3).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = supabaseAdmin();
    const stamp = new Date().toISOString();
    const { error } = await db.from("health_check").insert({ checked_at: stamp });
    if (error) throw error;
    const { data, error: readErr } = await db
      .from("health_check")
      .select("checked_at")
      .order("checked_at", { ascending: false })
      .limit(1);
    if (readErr) throw readErr;
    return NextResponse.json({ ok: true, lastWrite: data?.[0]?.checked_at ?? stamp });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
