// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { GOOGLE_SCOPES, authUrl, emailFromIdToken, eventBody, eventIdFor, parseFreeBusy } from "./google.ts";

const BOOKING = "3f2b6c1e-9a4d-4e8b-8c2a-0d1e2f3a4b5c";

test("asks Google for offline access with only the narrow calendar scopes", () => {
  const url = new URL(authUrl({ clientId: "cid", redirectUri: "https://p.example/admin/calendar/callback", state: "st" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "st");
  assert.equal(url.searchParams.get("scope"), GOOGLE_SCOPES.join(" "));
  assert.ok(!GOOGLE_SCOPES.includes("https://www.googleapis.com/auth/calendar"));
});

test("event ids are fixed per booking and valid for Google", () => {
  const id = eventIdFor(BOOKING);
  assert.equal(id, eventIdFor(BOOKING.toUpperCase()));
  assert.match(id, /^[a-v0-9]{5,1024}$/);
  assert.notEqual(id, eventIdFor("3f2b6c1e-9a4d-4e8b-8c2a-0d1e2f3a4b5d"));
  assert.throws(() => eventIdFor("not-a-uuid"), /Bad booking id/);
});

test("builds the event in UTC with the booking's zone and no attendees", () => {
  const body = eventBody(
    {
      id: BOOKING,
      starts_at: "2026-11-07T14:00:00+00:00",
      ends_at: "2026-11-07T15:00:00+00:00",
      timezone: "America/New_York",
      project_id: "p1",
      sessionName: "Mini session",
      clientName: "Ana Ruiz",
      clientEmail: "ana@example.com",
      clientPhone: null,
      notes: null,
    },
    "https://proofer.example/"
  );
  assert.equal(body.summary, "Mini session - Ana Ruiz");
  assert.deepEqual(body.start, { dateTime: "2026-11-07T14:00:00.000Z", timeZone: "America/New_York" });
  assert.equal(body.end.dateTime, "2026-11-07T15:00:00.000Z");
  assert.match(body.description, /Project: https:\/\/proofer\.example\/admin\/projects\/p1/);
  assert.ok(!/Phone/.test(body.description));
  assert.equal("attendees" in body, false);
});

test("reads busy times and refuses a calendar Google errored on", () => {
  const busy = parseFreeBusy(
    { calendars: { primary: { busy: [{ start: "2026-11-07T13:00:00Z", end: "2026-11-07T14:30:00Z" }, { start: "bad", end: "x" }] } } },
    "primary"
  );
  assert.equal(busy.length, 1);
  assert.equal(busy[0].start.toISOString(), "2026-11-07T13:00:00.000Z");
  assert.throws(() => parseFreeBusy({ calendars: { primary: { errors: [{ reason: "notFound" }] } } }, "primary"), /notFound/);
  assert.throws(() => parseFreeBusy({}, "primary"), /didn't return/);
});

test("reads the connected account's email from the id token", () => {
  const payload = Buffer.from(JSON.stringify({ email: "david@example.com" })).toString("base64url");
  assert.equal(emailFromIdToken(`h.${payload}.s`), "david@example.com");
  assert.equal(emailFromIdToken("garbage"), null);
  assert.equal(emailFromIdToken(undefined), null);
});
