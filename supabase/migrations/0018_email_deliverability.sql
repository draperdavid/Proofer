-- Deliverability (Phase 8.4). Resend's webhook reports what happened after a
-- send; we keep the worst outcome per email and stop mailing addresses that
-- hard-bounced or marked us as spam.
alter table email_log add column if not exists delivery_status text
  check (delivery_status in ('delivered', 'delayed', 'bounced', 'complained'));
alter table email_log add column if not exists delivery_detail text;
alter table email_log add column if not exists delivery_updated_at timestamptz;
create index if not exists email_log_provider_idx on email_log (provider_id) where provider_id is not null;

-- One row per address that must not be mailed again. David clears it from
-- the admin once the client gives a working address.
create table if not exists email_suppressions (
  email text primary key check (email = lower(email)),
  reason text not null check (reason in ('bounced', 'complained')),
  detail text,
  provider_id text,
  created_at timestamptz not null default now()
);
alter table email_suppressions enable row level security;

alter table email_log drop constraint if exists email_log_status_check;
alter table email_log add constraint email_log_status_check
  check (status in ('pending', 'sent', 'failed', 'skipped'));
