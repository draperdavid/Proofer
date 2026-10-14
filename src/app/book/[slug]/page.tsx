// Pick a time and book (Phase 4.4). Any active session type, public or
// private (private = direct link only). Plain HTML form posting to /api/book,
// which re-checks the time and holds it before sending the client to pay.
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { formatCents } from "@/app/admin/invoices/money";
import type { SessionType } from "@/app/admin/session-types/types";
import { bookableSlots } from "@/lib/booking/load";
import { localDate } from "@/lib/booking/book";

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 28;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export default async function BookSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  if (!SLUG.test(slug)) notFound();

  const db = supabaseAdmin();
  const { data, error: typeError } = await db
    .from("session_types")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (typeError) throw typeError;
  if (!data) notFound();
  const type = data as SessionType;

  const now = new Date();
  const { slots, timeZone } = await bookableSlots(db, type, {
    start: now,
    end: new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000),
  }, now);

  // Group by local day for the picker.
  const days = new Map<string, Date[]>();
  if (timeZone) {
    for (const s of slots) {
      const key = localDate(s.start, timeZone);
      days.set(key, [...(days.get(key) ?? []), s.start]);
    }
  }
  const dayLabel = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone ?? "UTC", weekday: "long", month: "long", day: "numeric" }).format(d);
  const timeLabel = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone ?? "UTC", hour: "numeric", minute: "2-digit" }).format(d);
  const zoneLabel = timeZone
    ? new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value
    : null;
  const deposit = type.deposit_cents !== null && type.deposit_cents < type.price_cents ? type.deposit_cents : null;

  return (
    <main>
      <h1>{type.name}</h1>
      <p>
        {type.duration_minutes} min · {formatCents(type.price_cents, type.currency)}
        {deposit !== null && ` · ${formatCents(deposit, type.currency)} deposit to book, the rest on the day`}
      </p>
      {type.description && <p>{type.description}</p>}
      {error && <p className="err">{error}</p>}

      {type.price_cents <= 0 || days.size === 0 ? (
        <p>No times are open in the next four weeks. Please get in touch instead.</p>
      ) : (
        <form action="/api/book" method="POST">
          <input type="hidden" name="slug" value={type.slug} />
          {/* Honeypot: hidden from real visitors. */}
          <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
            <label htmlFor="company">Company</label>
            <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          <h2>Pick a time</h2>
          {zoneLabel && <p className="muted">Times are in {zoneLabel}.</p>}
          {[...days.entries()].map(([key, starts]) => (
            <fieldset key={key}>
              <legend>{dayLabel(starts[0])}</legend>
              {starts.map((s) => (
                <label key={s.toISOString()} style={{ marginRight: "1em" }}>
                  <input type="radio" name="start" value={s.toISOString()} required /> {timeLabel(s)}
                </label>
              ))}
            </fieldset>
          ))}

          <h2>Your details</h2>
          <div>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" type="text" required maxLength={200} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="phone">Phone (optional)</label>
            <input id="phone" name="phone" type="tel" maxLength={50} autoComplete="tel" />
          </div>
          <div>
            <label htmlFor="notes">Anything I should know? (optional)</label>
            <textarea id="notes" name="notes" maxLength={2000} />
          </div>
          <button type="submit">Continue to payment</button>
        </form>
      )}
    </main>
  );
}
