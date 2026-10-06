-- Store catalog (Phase 7.1): categories, products, variants. Self-fulfilled
-- only; lab drop-ship would be a later migration widening `fulfillment`.
create sequence if not exists product_categories_position_seq;
create sequence if not exists product_variants_position_seq;

create table if not exists product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  position bigint not null default nextval('product_categories_position_seq'),
  created_at timestamptz not null default now()
);
create unique index if not exists product_categories_name_key on product_categories (lower(name));

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references product_categories(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  -- Price when the product has no variants, and the default for variants
  -- without their own price.
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'usd',
  fulfillment text not null default 'self' check (fulfillment in ('self')),
  requires_shipping boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on products (category_id);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sku text,
  -- null = use the product's price.
  price_cents integer check (price_cents is null or price_cents >= 0),
  active boolean not null default true,
  position bigint not null default nextval('product_variants_position_seq'),
  created_at timestamptz not null default now()
);
create unique index if not exists product_variants_name_key on product_variants (product_id, lower(name));
create index if not exists product_variants_product_idx on product_variants (product_id, position);

-- Deny-all, same as every other table.
alter table product_categories enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
