-- Client-facing branding (Phase 9.2). One row (id = 1). Admin themes stay in
-- src/lib/themes.ts; this is only what clients see: pages, emails.
-- Images live in the private media bucket under brand/ and are served by
-- presigned GET on pages and by the public /brand/<kind> route in emails.

create table if not exists brand_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'David Monroe Photography' check (length(trim(business_name)) between 1 and 120),
  logo_key text check (logo_key is null or logo_key ~ '^brand/logo/[0-9a-f-]{36}\.(png|jpg|webp|svg)$'),
  cover_logo_key text check (cover_logo_key is null or cover_logo_key ~ '^brand/cover_logo/[0-9a-f-]{36}\.(png|jpg|webp|svg)$'),
  default_cover_key text check (default_cover_key is null or default_cover_key ~ '^brand/default_cover/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  reply_to_email text check (reply_to_email is null or reply_to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  footer_text text check (footer_text is null or length(footer_text) <= 300),
  updated_at timestamptz not null default now()
);
alter table brand_settings enable row level security;

insert into brand_settings (id) values (1) on conflict (id) do nothing;
