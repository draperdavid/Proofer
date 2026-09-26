-- Invoices + line items (Phase 2.1). All amounts stored as integer cents;
-- the four *_cents totals are recomputed server-side from line items on every
-- save (see src/app/admin/invoices/money.ts) and never trusted from the client.
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete restrict,
  contact_id uuid not null references contacts(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','sent','paid','void')),
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'usd',
  discount_type text not null default 'none' check (discount_type in ('none','percent','flat')),
  discount_value numeric(10,2) not null default 0,
  tax_rate numeric(6,3) not null default 0,
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price_cents integer not null default 0,
  position int not null default 0
);

-- Same deny-all pattern as every other table: no anon/authenticated policies,
-- all access goes through supabaseAdmin() behind the /admin/* auth gate.
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
