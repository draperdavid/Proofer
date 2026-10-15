-- Video without Cloudflare Stream (David, 2026-10-15: avoid the monthly cost).
-- Run after 0029. The hourly variants job now makes each video's web copy
-- (H.264 MP4) and poster frame on GitHub Actions and records them in the
-- same variants / variants_ready / variant_attempts / variant_error columns
-- photos use. duration_seconds, width and height from 0029 stay.

drop index if exists media_assets_stream_pending_idx;
alter table media_assets drop constraint if exists media_assets_stream_video_only;
alter table media_assets
  drop column if exists stream_uid,
  drop column if exists stream_status,
  drop column if exists stream_error,
  drop column if exists stream_checked_at;
