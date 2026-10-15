-- Google Calendar sync (Phase 4.5, the Google half). Run after 0011-0029.
--
-- One connected Google account (David's). The refresh token is useless
-- without the app's client secret, which lives only in Worker secrets, and
-- the table is deny-all like every other, so only the service role reads it.

create table if not exists google_calendar (
  id int primary key default 1 check (id = 1),
  account_email text,
  calendar_id text not null default 'primary' check (length(calendar_id) between 1 and 300),
  refresh_token text,
  -- Short-lived (about an hour); kept so each page view doesn't refresh.
  access_token text,
  access_expires_at timestamptz,
  connected_at timestamptz,
  -- The last thing that went wrong talking to Google, shown in Settings.
  last_error text check (length(last_error) <= 500),
  last_error_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table google_calendar enable row level security;

-- The event Proofer put on the calendar for a booking. Its id is derived
-- from the booking id, so pushing twice can never make two events.
alter table bookings
  add column if not exists calendar_event_id text check (calendar_event_id ~ '^[a-v0-9]+$' and length(calendar_event_id) between 5 and 1024),
  add column if not exists calendar_synced_at timestamptz;

-- The sync job's work list: confirmed bookings not on the calendar yet, and
-- canceled ones still on it.
create index if not exists bookings_calendar_pending_idx on bookings (starts_at)
  where (status = 'confirmed' and calendar_event_id is null)
     or (status = 'canceled' and calendar_event_id is not null);
