-- Quotes + selectable packages (Phase 3.5). A quote offers one or more
-- packages; the client accepts exactly one from the public /quote/[id] page,
-- which auto-drafts an invoice from that package's line items. Package line
-- items are stored as a jsonb array (same shape as invoice_line_items:
-- description, quantity, unit_price_cents) rather than a third table —
-- nothing queries into them relationally, same reasoning as
-- questionnaire_templates.fields.
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete restrict,
  contact_id uuid not null references contacts(id) on delete restrict,
  title text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted')),
  currency text not null default 'usd',
  tax_rate numeric(6,3) not null default 0,
  notes text,
  accepted_package_id uuid,
  accepted_at timestamptz,
  invoice_id uuid references invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quote_packages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  name text not null,
  description text,
  line_items jsonb not null default '[]',
  position int not null default 0
);

-- Same deny-all pattern as every other table: no anon/authenticated policies,
-- all access goes through supabaseAdmin() behind the /admin/* auth gate (or,
-- for the public /quote/[id] route, a validated service-role read/write with
-- no Supabase session, same as /inquire, /pay, and /questionnaire).
alter table quotes enable row level security;
alter table quote_packages enable row level security;
