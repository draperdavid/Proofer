-- Payment schedules: deposits + balance, or custom installments (Phase 2.4).
--
-- An invoice with no installment rows is paid in one go, exactly as in 2.3.
-- An invoice with installments is paid one installment at a time; each is
-- its own Stripe Checkout payment and is tracked to paid on its own. The
-- invoice becomes paid when the last one is.
--
-- Guarantees enforced here (on top of 0022):
--   * An installment is marked paid only by record_stripe_event(), and only
--     when Stripe's amount and currency match that installment exactly.
--   * Once any installment is paid, the invoice, its line items and its
--     schedule are frozen (the paid money is tied to those numbers).
--   * A payment that names no installment is refused for an invoice that has
--     a schedule, and one that names an installment is refused for an invoice
--     without one. Both are recorded as not_payable for David to sort out.

create table if not exists invoice_installments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  position int not null,
  label text not null check (length(label) between 1 and 80),
  amount_cents integer not null check (amount_cents > 0),
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at timestamptz,
  stripe_payment_intent_id text,
  paid_checkout_session_id text,
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  unique (invoice_id, position),
  check ((status = 'paid') = (paid_at is not null))
);
create index if not exists invoice_installments_invoice_idx on invoice_installments (invoice_id, position);
alter table invoice_installments enable row level security;

-- Plain id, no foreign key: Stripe sends checkout.session.expired for every
-- abandoned checkout, and an audit row pinned to an unpaid installment would
-- stop David from ever editing that schedule. Paid installments are frozen
-- by the guard below, so their ids never go stale.
alter table payment_events add column if not exists installment_id uuid;
alter table payment_events drop constraint if exists payment_events_outcome_check;
alter table payment_events add constraint payment_events_outcome_check check (outcome in (
  'paid', 'installment_paid', 'recorded', 'already_paid', 'not_payable', 'amount_mismatch', 'unknown_invoice'
));

create or replace function invoice_has_paid_installment(p_invoice_id uuid) returns boolean
language sql stable as $$
  select exists (select 1 from invoice_installments where invoice_id = p_invoice_id and status = 'paid');
$$;

create or replace function invoice_installments_guard() returns trigger
language plpgsql as $$
declare
  marking boolean := coalesce(current_setting('proofer.marking_paid', true), '') = 'on';
  parent uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
begin
  if marking then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Opening Checkout for an unpaid installment only records the session id.
  if tg_op = 'UPDATE' and old.status = 'unpaid'
     and (new.invoice_id, new.position, new.label, new.amount_cents, new.due_date, new.status,
          new.paid_at, new.stripe_payment_intent_id, new.paid_checkout_session_id)
         is not distinct from
         (old.invoice_id, old.position, old.label, old.amount_cents, old.due_date, old.status,
          old.paid_at, old.stripe_payment_intent_id, old.paid_checkout_session_id) then
    return new;
  end if;
  if exists (select 1 from invoices where id = parent and status = 'paid') or invoice_has_paid_installment(parent) then
    raise exception 'A payment has been made on this invoice, so its schedule can''t be changed';
  end if;
  if tg_op <> 'DELETE' and (new.status = 'paid' or new.paid_at is not null
      or new.stripe_payment_intent_id is not null or new.paid_checkout_session_id is not null) then
    raise exception 'Only a verified Stripe payment can mark an installment paid';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists invoice_installments_guard on invoice_installments;
create trigger invoice_installments_guard before insert or update or delete on invoice_installments
  for each row execute function invoice_installments_guard();

-- Partially paid invoices are frozen too. Extends 0022's guard.
create or replace function invoices_paid_guard() returns trigger
language plpgsql as $$
declare
  marking boolean := coalesce(current_setting('proofer.marking_paid', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' or invoice_has_paid_installment(old.id) then
      raise exception 'An invoice with payments can''t be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'paid' then
    raise exception 'A paid invoice can''t be changed';
  end if;
  if tg_op = 'UPDATE' and not marking and invoice_has_paid_installment(old.id) then
    raise exception 'A payment has been made on this invoice, so it can''t be changed';
  end if;
  if new.status = 'paid' and not marking then
    raise exception 'Only a verified Stripe payment can mark an invoice paid';
  end if;
  if not marking and (
    new.paid_at is not null or new.amount_paid_cents is not null
    or new.stripe_payment_intent_id is not null or new.paid_checkout_session_id is not null
  ) then
    raise exception 'Payment fields are set only by a verified Stripe payment';
  end if;
  return new;
end;
$$;

create or replace function invoice_line_items_paid_guard() returns trigger
language plpgsql as $$
declare
  parent uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
begin
  if exists (select 1 from invoices where id = parent and status = 'paid')
     or invoice_has_paid_installment(parent)
     or (tg_op = 'UPDATE' and (exists (select 1 from invoices where id = old.invoice_id and status = 'paid')
                                or invoice_has_paid_installment(old.invoice_id))) then
    raise exception 'A payment has been made on this invoice, so its line items can''t be changed';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Replaces 0022's version: same contract plus p_installment_id.
drop function if exists record_stripe_event(text, text, boolean, uuid, text, text, integer, text, boolean, jsonb);

create or replace function record_stripe_event(
  p_event_id text,
  p_type text,
  p_livemode boolean,
  p_invoice_id uuid,
  p_installment_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_currency text,
  p_mark_paid boolean,
  p_payload jsonb
) returns text
language plpgsql as $$
declare
  inv invoices%rowtype;
  inst invoice_installments%rowtype;
  has_schedule boolean := false;
  result text;
begin
  -- Serialize concurrent deliveries of the same event.
  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 0));
  if exists (select 1 from payment_events where stripe_event_id = p_event_id) then
    return 'duplicate';
  end if;

  if p_invoice_id is not null then
    select * into inv from invoices where id = p_invoice_id for update;
  end if;
  if inv.id is not null then
    has_schedule := exists (select 1 from invoice_installments where invoice_id = inv.id);
    if p_installment_id is not null then
      select * into inst from invoice_installments
        where id = p_installment_id and invoice_id = inv.id for update;
    end if;
  end if;

  if inv.id is null and p_invoice_id is not null then
    result := 'unknown_invoice';
  elsif not p_mark_paid then
    result := 'recorded';
  elsif inv.id is null then
    result := 'unknown_invoice';
  elsif inv.status = 'paid' then
    result := 'already_paid';
  elsif inv.status <> 'sent' then
    result := 'not_payable';
  elsif lower(p_currency) is distinct from lower(inv.currency) then
    result := 'amount_mismatch';
  elsif has_schedule then
    if inst.id is null then
      result := 'not_payable';
    elsif inst.status = 'paid' then
      result := 'already_paid';
    elsif p_amount_cents is distinct from inst.amount_cents then
      result := 'amount_mismatch';
    else
      perform set_config('proofer.marking_paid', 'on', true);
      update invoice_installments set
        status = 'paid',
        paid_at = now(),
        stripe_payment_intent_id = p_payment_intent_id,
        paid_checkout_session_id = p_session_id
      where id = inst.id;
      if not exists (select 1 from invoice_installments where invoice_id = inv.id and status <> 'paid') then
        update invoices set
          status = 'paid',
          paid_at = now(),
          amount_paid_cents = (select sum(amount_cents) from invoice_installments where invoice_id = inv.id),
          stripe_payment_intent_id = p_payment_intent_id,
          paid_checkout_session_id = p_session_id,
          updated_at = now()
        where id = inv.id;
        result := 'paid';
      else
        result := 'installment_paid';
      end if;
      perform set_config('proofer.marking_paid', 'off', true);
    end if;
  elsif p_installment_id is not null then
    result := 'not_payable';
  elsif p_amount_cents is distinct from inv.total_cents then
    result := 'amount_mismatch';
  else
    perform set_config('proofer.marking_paid', 'on', true);
    update invoices set
      status = 'paid',
      paid_at = now(),
      amount_paid_cents = p_amount_cents,
      stripe_payment_intent_id = p_payment_intent_id,
      paid_checkout_session_id = p_session_id,
      updated_at = now()
    where id = inv.id;
    perform set_config('proofer.marking_paid', 'off', true);
    result := 'paid';
  end if;

  insert into payment_events (
    stripe_event_id, type, livemode, invoice_id, installment_id, checkout_session_id,
    payment_intent_id, amount_cents, currency, outcome, payload
  ) values (
    p_event_id, p_type, p_livemode, inv.id, p_installment_id, p_session_id,
    p_payment_intent_id, p_amount_cents, lower(p_currency), result, p_payload
  );
  return result;
end;
$$;

-- Callable by the service role only (the webhook's server code).
revoke all on function record_stripe_event(text, text, boolean, uuid, uuid, text, text, integer, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function record_stripe_event(text, text, boolean, uuid, uuid, text, text, integer, text, boolean, jsonb) to service_role;
revoke all on function invoice_has_paid_installment(uuid) from public, anon, authenticated;
grant execute on function invoice_has_paid_installment(uuid) to service_role;
