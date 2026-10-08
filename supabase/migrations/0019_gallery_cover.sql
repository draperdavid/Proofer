-- Gallery cover photo + a per-gallery summary for the Galleries list.
-- Run after 0011-0018.

-- Which photo is the gallery's cover. Null = use the first uploaded photo.
-- If the cover photo is deleted the gallery just falls back to the default.
alter table collections
  add column if not exists cover_asset_id uuid references media_assets(id) on delete set null;

-- One row per gallery: how many photos are uploaded, and which photo to show
-- as the cover (the chosen one, else the first by position). security_invoker
-- makes the view obey the deny-all RLS on its source tables, so the anon key
-- can't read it.
create or replace view collection_cards with (security_invoker = true) as
select
  c.id as collection_id,
  (select count(*) from media_assets m where m.collection_id = c.id and m.status = 'uploaded') as photo_count,
  coalesce(
    c.cover_asset_id,
    (select m.id from media_assets m
      where m.collection_id = c.id and m.status = 'uploaded'
      order by m.position limit 1)
  ) as cover_id
from collections c;
