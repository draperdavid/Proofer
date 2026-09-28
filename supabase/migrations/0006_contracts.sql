-- Contract templates + generated contracts (Phase 3.1). filled_body is the
-- source of truth for a generated contract — editing or deleting the
-- template it came from never retroactively changes it.
create table if not exists contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete restrict,
  contact_id uuid not null references contacts(id) on delete restrict,
  template_id uuid references contract_templates(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','awaiting_signature','in_progress','completed','canceled')),
  filled_body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same deny-all pattern as every other table: no anon/authenticated policies,
-- all access goes through supabaseAdmin() behind the /admin/* auth gate (or,
-- for the future public /sign/[id] route in task 3.2, a validated service-role
-- read/write with no Supabase session, same as /inquire and /pay).
alter table contract_templates enable row level security;
alter table contracts enable row level security;
