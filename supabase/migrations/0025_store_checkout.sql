-- Store in client galleries (Phase 7.2).
--
-- A gallery shows a Shop tab only when David turns its store on. Products
-- get one image in R2 under products/<product id>/<image id>.<ext>; the key
-- shape is checked here so a row can never point outside that prefix.
-- Orders are 7.3 (written only by the verified webhook); until then a store
-- Checkout payment is logged in payment_events with outcome "recorded".

alter table collections add column if not exists store_enabled boolean not null default false;

alter table products add column if not exists image_key text;
alter table products drop constraint if exists products_image_key_shape;
alter table products add constraint products_image_key_shape check (
  image_key is null
  or image_key ~ ('^products/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
);
