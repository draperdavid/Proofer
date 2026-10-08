import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { generateSlots, type SlotWindow } from "@/lib/booking/slots";
import type { SessionType } from "../session-types/types";
import { createWindow, deleteWindow } from "./actions";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PREVIEW_DAYS = 7;

type AvailabilityWindow = SlotWindow & { id: string };

function hhmm(time: string): string {
  return time.slice(0, 5);
}

export default async function AvailabilityPage() {
  const db = supabaseAdmin();
  const [windowsRes, typesRes] = await Promise.all([
    db
      .from("availability_windows")
      .select("id, weekday, start_time, end_time, timezone, session_type_id")
      .order("weekday")
      .order("start_time"),
    db.from("session_types").select("*").order("name"),
  ]);
  if (windowsRes.error) throw windowsRes.error;
  if (typesRes.error) throw typesRes.error;

  const windows = (windowsRes.data ?? []) as AvailabilityWindow[];
  const sessionTypes = (typesRes.data ?? []) as SessionType[];
  const typeName = new Map(sessionTypes.map((s) => [s.id, s.name]));

  // Preview renders in the business timezone (the first window's); there are
  // no bookings yet (4.4), so nothing is busy.
  const displayZone = windows[0]?.timezone;
  const now = new Date();
  const range = { start: now, end: new Date(now.getTime() + PREVIEW_DAYS * 24 * 60 * 60 * 1000) };
  const fmt = displayZone
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: displayZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <main>
      <h1>Availability</h1>
      <p className="hint">
        Booking rules live on each <Link href="/admin/session-types">session type</Link>.
      </p>

      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>From</th>
            <th>To</th>
            <th>Timezone</th>
            <th>Applies to</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {windows.map((w) => (
            <tr key={w.id}>
              <td>{WEEKDAYS[w.weekday]}</td>
              <td>{hhmm(w.start_time)}</td>
              <td>{hhmm(w.end_time)}</td>
              <td>{w.timezone}</td>
              <td>{w.session_type_id ? (typeName.get(w.session_type_id) ?? "—") : "All session types"}</td>
              <td>
                <form action={deleteWindow.bind(null, w.id)}>
                  <button type="submit">Delete</button>
                </form>
              </td>
            </tr>
          ))}
          {windows.length === 0 && (
            <tr>
              <td colSpan={6}>No availability yet — nothing is bookable.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Add a window</h2>
      <form action={createWindow} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <select name="weekday" required defaultValue="1">
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <input name="start_time" type="time" required defaultValue="09:00" />
        <input name="end_time" type="time" required defaultValue="17:00" />
        <input
          name="timezone"
          type="text"
          required
          placeholder="America/Chicago"
          defaultValue={displayZone ?? ""}
        />
        <select name="session_type_id" defaultValue="">
          <option value="">All session types</option>
          {sessionTypes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit">Add window</button>
      </form>

      <h2>Next {PREVIEW_DAYS} days</h2>
      {fmt && <p>Times shown in {displayZone}. Existing bookings aren&apos;t counted yet (booking lands in 4.4).</p>}
      {sessionTypes
        .filter((s) => s.active)
        .map((s) => {
          const slots = generateSlots(s, windows, [], range, now);
          return (
            <section key={s.id}>
              <h3>
                {s.name} ({s.duration_minutes} min)
              </h3>
              {slots.length === 0 || !fmt ? (
                <p>No slots offered.</p>
              ) : (
                <ul>
                  {slots.map((slot) => (
                    <li key={slot.start.toISOString()}>{fmt.format(slot.start)}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      {sessionTypes.every((s) => !s.active) && <p>No active session types.</p>}
    </main>
  );
}
