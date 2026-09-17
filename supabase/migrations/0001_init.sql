-- Proofer initial schema (Phase 0). Grows per phase.
-- Health check (Phase 0.3)
create table if not exists health_check (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now()
);

-- Contacts: clients and leads (Phase 1)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  kind text not null default 'lead' check (kind in ('lead','client')),
  tags text[] default '{}',
  source text,
  stripe_customer_id text,
  notes text,
  created_at timestamptz not null default now()
);

-- Project stages: editable kanban columns (Phase 1)
create table if not exists project_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  color text
);

-- Projects (Phase 1)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  stage_id uuid references project_stages(id) on delete set null,
  title text not null,
  type text,
  event_date date,
  location text,
  description text,
  private_notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed default kanban stages (matches Pixieset defaults)
insert into project_stages (name, position)
select v.name, v.position from (values
  ('Inquiry', 0), ('Booked', 1), ('Post-Production', 2), ('Completed', 3)
) as v(name, position)
where not exists (select 1 from project_stages);

-- NOTE: Row-level security policies are added in Phase 0.4 alongside auth.
