-- Availability windows + booking rules (Phase 4.3).
-- Windows are local wall-clock times plus an explicit IANA timezone; they are
-- converted to UTC only when slots are generated (src/lib/booking/slots.ts).
create table if not exists availability_windows (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  timezone text not null,
  -- null = applies to every session type
  session_type_id uuid references session_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

alter table availability_windows enable row level security;

alter table session_types
  add column if not exists min_notice_minutes int not null default 0 check (min_notice_minutes >= 0),
  add column if not exists buffer_before_minutes int not null default 0 check (buffer_before_minutes >= 0),
  add column if not exists buffer_after_minutes int not null default 0 check (buffer_after_minutes >= 0),
  -- null = unlimited
  add column if not exists max_bookings_per_day int check (max_bookings_per_day is null or max_bookings_per_day > 0);
