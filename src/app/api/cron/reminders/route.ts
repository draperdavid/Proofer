// Hourly reminder run (Phase 8.3). Called only by the Worker's own cron
// trigger (worker.mjs), which proves itself with a token derived from the
// service-role key; anything else gets 401.
import { CRON_HEADER, verifyCronToken } from "@/lib/reminders/cron-auth";
import { runReminders } from "@/lib/reminders/run";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const given = request.headers.get(CRON_HEADER);
  if (!secret || !given || !(await verifyCronToken(secret, given))) {
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }
  // Reminder links must point at the real site, never a guessed host.
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) return Response.json({ ok: false, note: "APP_BASE_URL isn't set" }, { status: 503 });

  try {
    const summary = await runReminders({ baseUrl });
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    console.error("reminder run failed", err);
    return Response.json({ ok: false, error: "Reminder run failed" }, { status: 500 });
  }
}
