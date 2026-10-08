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
