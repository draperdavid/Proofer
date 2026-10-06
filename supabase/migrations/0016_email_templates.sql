-- Email templates + send log (Phase 8.1). Built-in defaults live in code
-- (src/lib/email/templates.ts); a row here exists only once David edits a
-- template, and deleting it resets to the default.
create table if not exists email_templates (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  subject text not null check (length(trim(subject)) > 0),
  body text not null check (length(trim(body)) > 0),
  updated_at timestamptz not null default now()
);

create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  to_email text not null,
  subject text not null,
  -- skipped = Resend not configured on this environment; nothing was sent.
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id text,
  error text,
  contact_id uuid references contacts(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists email_log_created_idx on email_log (created_at desc);
create index if not exists email_log_contact_idx on email_log (contact_id);

alter table email_templates enable row level security;
alter table email_log enable row level security;
