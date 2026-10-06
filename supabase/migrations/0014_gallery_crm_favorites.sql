-- Gallery CRM link + favorites (Phase 5.6). Run after 0011-0013.
--
-- A collection can belong to a contact and/or a project. Deleting either just
-- unlinks the gallery; the photos stay.
alter table collections
  add column if not exists contact_id uuid references contacts(id) on delete set null,
  add column if not exists project_id uuid references projects(id) on delete set null;
create index if not exists collections_contact_idx on collections (contact_id);
create index if not exists collections_project_idx on collections (project_id);

-- Favorites (proofing). The client identity is the email the visitor gives on
-- the gallery page, stored lowercased. It is not verified (same as Pixieset)
-- until client sign-in exists; it is matched to a contact by email at read
-- time rather than stored, so a later contact edit can't leave a stale link.
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  asset_id uuid not null references media_assets(id) on delete cascade,
  visitor_email text not null
    check (visitor_email = lower(visitor_email) and visitor_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(visitor_email) <= 254),
  created_at timestamptz not null default now(),
  unique (asset_id, visitor_email)
);
create index if not exists favorites_collection_idx on favorites (collection_id, visitor_email);

-- Deny-all, same as every other table: reads and writes go through
-- supabaseAdmin() behind the admin gate or the validated public gallery routes.
alter table favorites enable row level security;
