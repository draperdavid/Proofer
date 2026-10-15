-- Video in galleries (Phase 6.2-6.4). Run after 0011-0028.
--
-- A video is a media asset like a photo: same sets, ordering, favorites and
-- download grants. The original sits on R2 under the asset's prefix;
-- Cloudflare Stream holds the web-playable copy, found by stream_uid.

alter table media_assets drop constraint if exists media_assets_kind_check;
alter table media_assets add constraint media_assets_kind_check check (kind in ('photo', 'video'));

alter table media_assets
  -- Stream's id for the playable copy. Null until the copy job is queued.
  add column if not exists stream_uid text unique,
  add column if not exists stream_status text
    check (stream_status in ('queued', 'processing', 'ready', 'error')),
  add column if not exists stream_error text check (length(stream_error) <= 500),
  -- When the app last asked Stream about this video (the fallback status
  -- check), so a page view or cron run doesn't ask again straight away.
  add column if not exists stream_checked_at timestamptz,
  add column if not exists duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  add column if not exists width int check (width is null or width > 0),
  add column if not exists height int check (height is null or height > 0);

-- Stream fields belong to videos only.
alter table media_assets drop constraint if exists media_assets_stream_video_only;
alter table media_assets add constraint media_assets_stream_video_only
  check (kind = 'video' or (stream_uid is null and stream_status is null and stream_error is null));

-- The fallback status check's work list: videos Stream hasn't finished.
create index if not exists media_assets_stream_pending_idx
  on media_assets (stream_checked_at nulls first)
  where kind = 'video' and stream_status in ('queued', 'processing');

-- Covers are photos. Counting still includes videos (the card says "items"
-- worth of media), but the fallback cover is the first uploaded photo.
create or replace view collection_cards with (security_invoker = true) as
select
  c.id as collection_id,
  (select count(*) from media_assets m where m.collection_id = c.id and m.status = 'uploaded') as photo_count,
  coalesce(
    c.cover_asset_id,
    (select m.id from media_assets m
      where m.collection_id = c.id and m.status = 'uploaded' and m.kind = 'photo'
      order by m.position limit 1)
  ) as cover_id
from collections c;

-- A video can't be picked as the cover.
create or replace function collections_cover_is_photo() returns trigger
language plpgsql as $$
begin
  if new.cover_asset_id is not null and exists (
    select 1 from media_assets where id = new.cover_asset_id and kind <> 'photo'
  ) then
    raise exception 'A gallery cover must be a photo';
  end if;
  return new;
end;
$$;

drop trigger if exists collections_cover_is_photo on collections;
create trigger collections_cover_is_photo
  before insert or update of cover_asset_id on collections
  for each row execute function collections_cover_is_photo();
