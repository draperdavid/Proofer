-- Double-booking prevention at the database level (Phase 4.5, the part that
-- doesn't need Google Calendar).
--
-- Two confirmed bookings can never overlap (session plus buffers), no matter
-- what the app does: an exclusion constraint on the blocked range. Holds are
-- not in the constraint (they expire by time, which a constraint can't see);
-- hold_booking() already refuses overlaps with live holds under a lock.
--
-- Confirmation (fired by a verified payment, 0024) now skips a booking whose
-- time was taken in the meantime instead of failing: the payment is still
-- recorded, the booking stays pending, and the admin Bookings page shows it
-- as needing attention. Without this, the constraint would make the webhook
-- fail and Stripe would retry a payment that can never apply.

create extension if not exists btree_gist;

alter table bookings drop constraint if exists bookings_no_overlap;
alter table bookings add constraint bookings_no_overlap
  exclude using gist (tstzrange(blocked_from, blocked_until) with &&) where (status = 'confirmed');

create or replace function bookings_confirm_on_invoice_paid() returns trigger
language plpgsql as $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    update bookings b set status = 'confirmed', confirmed_at = now()
    where b.invoice_id = new.id and b.status = 'pending_payment'
      and not exists (
        select 1 from bookings o
        where o.id <> b.id and o.status = 'confirmed'
          and tstzrange(o.blocked_from, o.blocked_until) && tstzrange(b.blocked_from, b.blocked_until)
      );
  end if;
  return new;
end;
$$;

create or replace function bookings_confirm_on_installment_paid() returns trigger
language plpgsql as $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    update bookings b set status = 'confirmed', confirmed_at = now()
    where b.invoice_id = new.invoice_id and b.status = 'pending_payment'
      and not exists (
        select 1 from bookings o
        where o.id <> b.id and o.status = 'confirmed'
          and tstzrange(o.blocked_from, o.blocked_until) && tstzrange(b.blocked_from, b.blocked_until)
      );
  end if;
  return new;
end;
$$;
