-- Public booking (Phase 4.4).
--
-- A booking starts as a short hold (pending_payment) on a time range, made
-- only through hold_booking(), which refuses any range that overlaps a
-- confirmed booking or a live hold. The client then pays the booking's
-- invoice through the normal /pay flow, and the booking is confirmed only
-- when the verified Stripe webhook marks that invoice (or its first
-- installment) paid: a trigger here, fired by record_stripe_event's update,
-- never by the browser.
--
-- blocked_from / blocked_until are the session plus its buffers; two bookings
-- conflict when those ranges overlap. Times are UTC instants (timestamptz).
-- 4.5 adds the DB-level exclusion constraint and Google Calendar.

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  session_type_id uuid not null references session_types(id) on delete restrict,
  -- Filled in right after the hold succeeds; a hold whose follow-up failed
  -- just expires.
  contact_id uuid references contacts(id) on delete restrict,
  project_id uuid references projects(id) on delete restrict,
  invoice_id uuid unique references invoices(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  blocked_from timestamptz not null,
  blocked_until timestamptz not null,
  timezone text not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'confirmed', 'canceled')),
  hold_expires_at timestamptz not null,
  confirmed_at timestamptz,
  canceled_at timestamptz,
  -- Set once the contract / questionnaire / confirmation email went out.
  intake_sent_at timestamptz,
  client_notes text check (client_notes is null or length(client_notes) <= 2000),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (blocked_from <= starts_at and blocked_until >= ends_at),
  check (status <> 'confirmed' or confirmed_at is not null)
);
create index if not exists bookings_blocked_idx on bookings (blocked_from, blocked_until);
create index if not exists bookings_invoice_idx on bookings (invoice_id);
alter table bookings enable row level security;

-- A booking that holds its time: confirmed, or a hold that hasn't expired.
create or replace function booking_is_live(b bookings) returns boolean
language sql stable as $$
  select b.status = 'confirmed' or (b.status = 'pending_payment' and b.hold_expires_at > now());
$$;

-- Holds [p_blocked_from, p_blocked_until) until p_hold_until, or returns null
-- if anything live overlaps it. One global lock: a single photographer's
-- calendar never sees enough traffic for it to matter.
create or replace function hold_booking(
  p_session_type_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_blocked_from timestamptz,
  p_blocked_until timestamptz,
  p_timezone text,
  p_hold_until timestamptz,
  p_client_notes text
) returns uuid
language plpgsql as $$
declare
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('proofer.bookings', 0));
  if exists (
    select 1 from bookings b
    where booking_is_live(b)
      and tstzrange(b.blocked_from, b.blocked_until) && tstzrange(p_blocked_from, p_blocked_until)
  ) then
    return null;
  end if;
  insert into bookings (session_type_id, starts_at, ends_at, blocked_from, blocked_until, timezone, hold_expires_at, client_notes)
  values (p_session_type_id, p_starts_at, p_ends_at, p_blocked_from, p_blocked_until, p_timezone, p_hold_until, p_client_notes)
  returning id into new_id;
  return new_id;
end;
$$;

-- Keeps a pending booking's hold alive until p_hold_until (called when the
-- client opens Checkout, so the hold always outlasts the Checkout session).
-- Returns false if the hold is gone or its time has been taken since.
create or replace function extend_booking_hold(p_booking_id uuid, p_hold_until timestamptz) returns boolean
language plpgsql as $$
declare
  b bookings%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('proofer.bookings', 0));
  select * into b from bookings where id = p_booking_id for update;
  if b.id is null or b.status <> 'pending_payment' then
    return false;
  end if;
  if exists (
    select 1 from bookings o
    where o.id <> b.id and booking_is_live(o)
      and tstzrange(o.blocked_from, o.blocked_until) && tstzrange(b.blocked_from, b.blocked_until)
  ) then
    return false;
  end if;
  update bookings set hold_expires_at = greatest(hold_expires_at, p_hold_until) where id = b.id;
  return true;
end;
$$;

-- Confirmation comes only from a payment being applied, which only
-- record_stripe_event() can do (0022/0023 guards). First money in confirms.
create or replace function bookings_confirm_on_invoice_paid() returns trigger
language plpgsql as $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    update bookings set status = 'confirmed', confirmed_at = now()
    where invoice_id = new.id and status = 'pending_payment';
  end if;
  return new;
end;
$$;

create or replace function bookings_confirm_on_installment_paid() returns trigger
language plpgsql as $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    update bookings set status = 'confirmed', confirmed_at = now()
    where invoice_id = new.invoice_id and status = 'pending_payment';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_confirm_on_invoice_paid on invoices;
create trigger bookings_confirm_on_invoice_paid after update on invoices
  for each row execute function bookings_confirm_on_invoice_paid();

drop trigger if exists bookings_confirm_on_installment_paid on invoice_installments;
create trigger bookings_confirm_on_installment_paid after update on invoice_installments
  for each row execute function bookings_confirm_on_installment_paid();

-- Only payment (above) may confirm; David may cancel.
create or replace function bookings_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'confirmed' then
      raise exception 'A confirmed booking can''t be deleted; cancel it instead';
    end if;
    return old;
  end if;
  if new.status = 'confirmed' and old.status <> 'confirmed'
     and coalesce(current_setting('proofer.marking_paid', true), '') <> 'on' then
    raise exception 'Only a verified payment can confirm a booking';
  end if;
  if old.status = 'canceled' and new.status <> 'canceled' then
    raise exception 'A canceled booking can''t be reopened';
  end if;
  if old.status = 'confirmed' and new.status not in ('confirmed', 'canceled') then
    raise exception 'A confirmed booking can only be canceled';
  end if;
  if (new.starts_at, new.ends_at, new.blocked_from, new.blocked_until, new.session_type_id)
     is distinct from (old.starts_at, old.ends_at, old.blocked_from, old.blocked_until, old.session_type_id) then
    raise exception 'A booking''s time can''t be changed; cancel it and book again';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_guard on bookings;
create trigger bookings_guard before update or delete on bookings
  for each row execute function bookings_guard();

revoke all on function hold_booking(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, text) from public, anon, authenticated;
grant execute on function hold_booking(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, text) to service_role;
revoke all on function extend_booking_hold(uuid, timestamptz) from public, anon, authenticated;
grant execute on function extend_booking_hold(uuid, timestamptz) to service_role;
