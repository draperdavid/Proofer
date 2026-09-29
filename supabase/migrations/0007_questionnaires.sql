-- Questionnaire templates (reusable field definitions) + sent instances
-- (Phase 3.4). A questionnaire's `fields` is snapshotted from its template at
-- send time, same immutability convention as contracts' filled_body — editing
-- the template afterward never changes an already-sent questionnaire.
create table if not exists questionnaire_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fields jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists questionnaires (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete restrict,
  contact_id uuid not null references contacts(id) on delete restrict,
  template_id uuid references questionnaire_templates(id) on delete set null,
  fields jsonb not null,
  answers jsonb not null default '{}',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same deny-all pattern as every other table: no anon/authenticated policies,
-- all access goes through supabaseAdmin() behind the /admin/* auth gate (or,
-- for the public /questionnaire/[id] route, a validated service-role
-- read/write with no Supabase session, same as /inquire, /pay, and the
-- future /sign route).
alter table questionnaire_templates enable row level security;
alter table questionnaires enable row level security;
