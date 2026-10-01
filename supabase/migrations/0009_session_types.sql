-- Session types (Phase 4.2): the reusable services a client can book.
-- Booking rules (min notice, buffers, spot limits) are added as columns in
-- 4.3 alongside availability windows. image_url is plain text until R2
-- upload exists (Phase 5).
create table if not exists session_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  image_url text,
  duration_minutes int not null check (duration_minutes > 0),
  price_cents int not null default 0 check (price_cents >= 0),
  -- null = pay in full at booking
  deposit_cents int check (deposit_cents is null or (deposit_cents > 0 and deposit_cents <= price_cents)),
  currency text not null default 'usd',
  is_public boolean not null default true,
  active boolean not null default true,
  contract_template_id uuid references contract_templates(id) on delete set null,
  questionnaire_template_id uuid references questionnaire_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same deny-all pattern as every other table: all access goes through
-- supabaseAdmin() behind the /admin/* auth gate (and, from 4.4, validated
-- service-role reads on the public /book routes).
alter table session_types enable row level security;
