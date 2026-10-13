-- Download limits (Phase 5.5). Run after 0011-0019.
--
-- Limits count distinct photos, never clicks: a download grant is one photo
-- for one visitor, and re-downloading a photo you already have is free.
--   download_limit            = distinct photos that may leave this gallery,
--                               across everyone (a photo someone already
--                               downloaded doesn't count again).
--   per_person_download_limit = distinct photos per visitor email (the same
--                               self-reported, unverified email favorites use).
-- null = no limit. Both are enforced only inside claim_download(), which locks
-- the collection row so two downloads at once can't both take the last credit.

alter table collections
  add column if not exists downloads_enabled boolean not null default true,
  add column if not exists download_size text not null default 'original'
    check (download_size in ('original', '3600', '2048', '1024')),
  add column if not exists download_limit integer check (download_limit is null or download_limit >= 0),
  add column if not exists per_person_download_limit integer
    check (per_person_download_limit is null or per_person_download_limit >= 0);

alter table photo_sets add column if not exists downloadable boolean not null default true;

-- One row per (photo, visitor) that has used a credit. visitor_key is the
-- visitor's lowercased email, or '' for a visitor who hasn't given one (only
-- possible when there's no per-person limit).
create table if not exists download_grants (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  asset_id uuid not null references media_assets(id) on delete cascade,
  visitor_key text not null default '' check (visitor_key = lower(visitor_key) and length(visitor_key) <= 254),
  created_at timestamptz not null default now(),
  unique (asset_id, visitor_key)
);
create index if not exists download_grants_collection_idx on download_grants (collection_id, visitor_key);

-- Every download, including free re-downloads.
create table if not exists download_events (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  asset_id uuid not null references media_assets(id) on delete cascade,
  visitor_key text not null default '',
  size text not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists download_events_collection_idx on download_events (collection_id, created_at desc);

alter table download_grants enable row level security;
alter table download_events enable row level security;

-- Returns 'ok' (credit recorded or already held; event logged) or the reason
-- the download is refused: not_found, disabled, set_not_downloadable,
-- need_email, gallery_limit, person_limit. Nothing is recorded on refusal.
create or replace function claim_download(
  p_collection_id uuid,
  p_asset_id uuid,
  p_visitor_key text,
  p_size text,
  p_ip text,
  p_user_agent text
) returns text
language plpgsql as $$
declare
  c collections%rowtype;
  set_ok boolean;
  used integer;
begin
  -- Serialises every claim for this gallery until the transaction ends.
  select * into c from collections where id = p_collection_id for update;
  if not found or c.status <> 'published' then
    return 'not_found';
  end if;
  if not c.downloads_enabled then
    return 'disabled';
  end if;

  select ps.downloadable into set_ok
  from media_assets ma join photo_sets ps on ps.id = ma.set_id
  where ma.id = p_asset_id and ma.collection_id = p_collection_id and ma.status = 'uploaded';
  if not found then
    return 'not_found';
  end if;
  if not set_ok then
    return 'set_not_downloadable';
  end if;
  if c.per_person_download_limit is not null and p_visitor_key = '' then
    return 'need_email';
  end if;

  if not exists (select 1 from download_grants where asset_id = p_asset_id and visitor_key = p_visitor_key) then
    if c.download_limit is not null and not exists (select 1 from download_grants where asset_id = p_asset_id) then
      select count(distinct asset_id) into used from download_grants where collection_id = p_collection_id;
      if used >= c.download_limit then
        return 'gallery_limit';
      end if;
    end if;
    if c.per_person_download_limit is not null then
      select count(*) into used from download_grants
      where collection_id = p_collection_id and visitor_key = p_visitor_key;
      if used >= c.per_person_download_limit then
        return 'person_limit';
      end if;
    end if;
    insert into download_grants (collection_id, asset_id, visitor_key)
    values (p_collection_id, p_asset_id, p_visitor_key);
  end if;

  insert into download_events (collection_id, asset_id, visitor_key, size, ip, user_agent)
  values (p_collection_id, p_asset_id, p_visitor_key, p_size, p_ip, p_user_agent);
  return 'ok';
end;
$$;

revoke all on function claim_download(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function claim_download(uuid, uuid, text, text, text, text) to service_role;
