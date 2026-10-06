-- Event-triggered email (Phase 8.2).
-- automation_rules: "when a project enters this stage, email its contact this
-- template". Deleting a stage deletes its rules.
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references project_stages(id) on delete cascade,
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_]*$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (stage_id, template_key)
);
alter table automation_rules enable row level security;

-- One send per event: a triggered send claims its key with a 'pending' row
-- before calling Resend, so a double click or a retried request can't mail
-- the client twice. Failed/skipped sends release the key so a later event can
-- retry; only a successful send keeps it.
alter table email_log add column if not exists idempotency_key text;
create unique index if not exists email_log_idempotency_idx
  on email_log (idempotency_key) where idempotency_key is not null;

alter table email_log drop constraint if exists email_log_status_check;
alter table email_log add constraint email_log_status_check
  check (status in ('pending', 'sent', 'failed', 'skipped'));
