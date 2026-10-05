-- Gallery privacy (Phase 5.3). Run after 0011 and 0012.
--
-- visibility: public = anyone with the link; password = shared gallery
-- password; private = signed-in contacts only (client sign-in not wired yet,
-- so private galleries are closed to everyone for now). Defaults to private so
-- a new or existing collection is never accidentally open.
--
-- password_hash is PBKDF2 (see src/lib/galleries/access.ts), never plaintext.
-- access_version is baked into every unlock cookie; bumping it (on a password
-- or visibility change) signs every visitor out of that gallery.
alter table collections
  add column if not exists visibility text not null default 'private'
    check (visibility in ('public', 'password', 'private')),
  add column if not exists password_hash text,
  add column if not exists access_version integer not null default 1;

alter table collections drop constraint if exists collections_password_required;
alter table collections
  add constraint collections_password_required
  check (visibility <> 'password' or password_hash is not null);
