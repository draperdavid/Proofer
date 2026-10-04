-- Photo size variants (Phase 5.2). The variants job (GitHub Actions, see
-- .github/workflows/variants.yml) fills these in after upload.
alter table media_assets
  -- {"640": {"key": "...", "width": 640, "height": 427}, ...}
  add column if not exists variants jsonb not null default '{}'::jsonb,
  add column if not exists variants_ready boolean not null default false,
  add column if not exists variant_attempts int not null default 0 check (variant_attempts >= 0),
  add column if not exists variant_error text;

-- The job's work queue: uploaded photos still waiting for their sizes.
create index if not exists media_assets_variants_pending_idx
  on media_assets (created_at)
  where status = 'uploaded' and not variants_ready;
