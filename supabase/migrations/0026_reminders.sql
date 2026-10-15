-- Scheduled reminders (Phase 8.3).
--
-- reminder_settings: David's on/off switch per kind of reminder. Everything
-- starts OFF, the same opt-in as stage emails: nothing mails a client on a
-- schedule until David turns it on in /admin/emails/reminders.
--
-- automation_jobs: the queue. The hourly cron adds a job for each reminder an
-- open document should get, sends the ones that are due, retries failures
-- with backoff, and cancels the ones whose document is resolved (paid,
-- signed, answered). One row per (kind, document, step), so a reminder can
-- never be queued twice, and email_log's idempotency key (reminder:<job id>)
-- stops it being mailed twice.
create table if not exists reminder_settings (
  kind text primary key check (kind in ('invoice', 'contract', 'questionnaire')),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into reminder_settings (kind) values ('invoice'), ('contract'), ('questionnaire')
  on conflict (kind) do nothing;
alter table reminder_settings enable row level security;

create table if not exists automation_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('invoice', 'installment', 'contract', 'questionnaire')),
  -- The invoice, installment, contract or questionnaire. No foreign key:
  -- kinds point at different tables, and a deleted document just means the
  -- job is canceled on the next run.
  target_id uuid not null,
  step text not null check (step ~ '^[a-z0-9_]+$'),
  run_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'sent', 'skipped', 'canceled', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text,
  contact_id uuid references contacts(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, target_id, step)
);
create index if not exists automation_jobs_due_idx on automation_jobs (run_at) where status = 'scheduled';
create index if not exists automation_jobs_open_idx on automation_jobs (status) where status in ('scheduled', 'running', 'canceled');
alter table automation_jobs enable row level security;
