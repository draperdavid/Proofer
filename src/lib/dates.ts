// Date-only values (an event date like "2026-11-14") have no time zone. Parsing
// one with `new Date("2026-11-14")` treats it as midnight UTC, which shows as the
// previous day in US time zones. These helpers never go through Date.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-11-14" -> "Nov 14, 2026" (or "Nov 14" with withYear = false).
export function formatDay(day: string, withYear = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return day;
  return `${month} ${Number(m[3])}${withYear ? `, ${m[1]}` : ""}`;
}

// Today as "YYYY-MM-DD" in UTC, for comparing against date-only values.
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Timestamps render on the server (UTC on Workers), so name the zone. Single
// operator in Georgia.
export const BUSINESS_TIME_ZONE = "America/New_York";

// "2026-10-14T15:57:00Z" -> "Oct 14, 2026, 11:57 AM" in the business time zone.
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: BUSINESS_TIME_ZONE });
}

// Today as "YYYY-MM-DD" in the business time zone (due dates are his days).
export function businessTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
