-- Galleries (Phase 5.1): collections, photo sets, and the media assets
-- stored in R2. Privacy/access (5.3), download limits (5.5) and the CRM link
-- (5.6) are added as later migrations.
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  event_date date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Positions come from sequences so concurrent inserts never tie, and an
-- up/down reorder is a two-row swap rather than a full renumber.
create sequence if not exists photo_sets_position_seq;
create sequence if not exists media_assets_position_seq;

create table if not exists photo_sets (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  name text not null,
  position bigint not null default nextval('photo_sets_position_seq'),
  created_at timestamptz not null default now()
);
create index if not exists photo_sets_collection_idx on photo_sets (collection_id, position);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  set_id uuid not null references photo_sets(id) on delete cascade,
  kind text not null default 'photo' check (kind in ('photo')),
  -- Private R2 object key, never a public URL.
  r2_key text not null unique,
  original_filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  -- pending = presigned URL issued; uploaded = server confirmed the object exists.
  status text not null default 'pending' check (status in ('pending', 'uploaded')),
  position bigint not null default nextval('media_assets_position_seq'),
  created_at timestamptz not null default now()
);
create index if not exists media_assets_set_idx on media_assets (set_id, position);
create index if not exists media_assets_collection_idx on media_assets (collection_id);

-- Same deny-all pattern as every other table: all access goes through
-- supabaseAdmin() behind the /admin/* auth gate (and, from 5.3, validated
-- service-role reads on the public gallery routes).
alter table collections enable row level security;
alter table photo_sets enable row level security;
alter table media_assets enable row level security;
