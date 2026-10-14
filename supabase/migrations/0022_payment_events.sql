-- Stripe webhook + payment audit log (Phase 2.3).
--
-- Guarantees enforced here, in the database, so no app bug can break them:
--   * An invoice becomes paid only through record_stripe_event(), and only
--     when the invoice is sent and Stripe's amount and currency match its
--     total exactly. Any other path that sets status = 'paid' is refused.
--   * A paid invoice can never be updated or deleted, and its line items are
--     frozen.
--   * payment_events is append-only, with one row per Stripe event id, so a
--     redelivered event is a no-op.
--   * Every verified event is recorded with an outcome, including the ones
--     that didn't mark anything paid (mismatched amount, already paid, ...),
--     so money that arrived for the wrong state is visible, never dropped.
-- The service role bypasses RLS but not triggers or constraints.

alter table invoices add column if not exists paid_at timestamptz;
alter table invoices add column if not exists amount_paid_cents integer;
alter table invoices add column if not exists stripe_payment_intent_id text;
alter table invoices add column if not exists paid_checkout_session_id text;

alter table invoices drop constraint if exists invoices_paid_complete;
alter table invoices add constraint invoices_paid_complete check (
  (status = 'paid') = (paid_at is not null and amount_paid_cents is not null)
);

-- Audit trail. Rows are only ever inserted.
create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  livemode boolean not null,
  -- Null when the event names no invoice, or one that doesn't exist; the
  -- claimed id stays in payload.
  invoice_id uuid references invoices(id) on delete restrict,
  checkout_session_id text,
  payment_intent_id text,
  amount_cents integer,
  currency text,
  outcome text not null check (outcome in (
    'paid',            -- this event marked the invoice paid
    'recorded',        -- informational (expired, failed, refund, async pending)
    'already_paid',    -- a payment for an invoice that was already paid
    'not_payable',     -- invoice was draft or void when the payment arrived
    'amount_mismatch', -- Stripe's amount/currency differs from the invoice total
    'unknown_invoice'  -- no invoice with the id in the session metadata
  )),
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index if not exists payment_events_invoice_idx on payment_events (invoice_id, received_at);
alter table payment_events enable row level security;

create or replace function payment_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'The payment audit trail is append-only';
end;
$$;

drop trigger if exists payment_events_append_only on payment_events;
create trigger payment_events_append_only before update or delete on payment_events
  for each row execute function payment_events_append_only();

-- Set (transaction-local) only inside record_stripe_event().
create or replace function invoices_paid_guard() returns trigger
language plpgsql as $$
declare
  marking boolean := coalesce(current_setting('proofer.marking_paid', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then
      raise exception 'A paid invoice can''t be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'paid' then
    raise exception 'A paid invoice can''t be changed';
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

drop trigger if exists invoices_paid_guard on invoices;
create trigger invoices_paid_guard before insert or update or delete on invoices
  for each row execute function invoices_paid_guard();

create or replace function invoice_line_items_paid_guard() returns trigger
language plpgsql as $$
declare
  parent uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
begin
  if exists (select 1 from invoices where id = parent and status = 'paid')
     or (tg_op = 'UPDATE' and exists (select 1 from invoices where id = old.invoice_id and status = 'paid')) then
    raise exception 'A paid invoice''s line items can''t be changed';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists invoice_line_items_paid_guard on invoice_line_items;
create trigger invoice_line_items_paid_guard before insert or update or delete on invoice_line_items
  for each row execute function invoice_line_items_paid_guard();

-- Records one verified Stripe event and, when p_mark_paid, tries to mark its
-- invoice paid, all in one transaction. Returns the outcome, or 'duplicate'
-- if this event id was already recorded (nothing changes).
create or replace function record_stripe_event(
  p_event_id text,
  p_type text,
  p_livemode boolean,
  p_invoice_id uuid,
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
  elsif p_amount_cents is distinct from inv.total_cents
        or lower(p_currency) is distinct from lower(inv.currency) then
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
    stripe_event_id, type, livemode, invoice_id, checkout_session_id,
    payment_intent_id, amount_cents, currency, outcome, payload
  ) values (
    p_event_id, p_type, p_livemode, inv.id, p_session_id,
    p_payment_intent_id, p_amount_cents, lower(p_currency), result, p_payload
  );
  return result;
end;
$$;

-- Callable by the service role only (the webhook's server code).
revoke all on function record_stripe_event(text, text, boolean, uuid, text, text, integer, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function record_stripe_event(text, text, boolean, uuid, text, text, integer, text, boolean, jsonb) to service_role;
