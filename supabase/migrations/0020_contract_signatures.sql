-- Self-built e-signature (Phase 3.2) + contract status rules (Phase 3.3).
--
-- Guarantees enforced here, in the database, so no app bug can break them:
--   * Only the transitions draft -> awaiting_signature,
--     awaiting_signature -> canceled and awaiting_signature -> completed exist.
--   * A completed (signed) contract can never be updated or deleted.
--   * The contract text can't change once it has left draft.
--   * Signature fields exist only on a completed contract, and a completed
--     contract always has all of them.
--   * contract_events is append-only.
--   * Signing happens only through sign_contract(), which checks the text the
--     client saw is the text stored, and writes the audit row in the same
--     transaction.
-- The service role bypasses RLS but not triggers or constraints.

alter table contracts add column if not exists signer_name text;
alter table contracts add column if not exists signer_email text;
alter table contracts add column if not exists signed_at timestamptz;
alter table contracts add column if not exists signer_ip text;
alter table contracts add column if not exists signer_user_agent text;
-- SHA-256 (hex) of filled_body as signed, and of the signed PDF's bytes. The
-- PDF is rebuilt from this row on download and must hash to pdf_sha256.
-- Project title and client name as they read at signing; the signed PDF
-- shows these, so a later rename doesn't change the signed copy.
alter table contracts add column if not exists signed_title text;
alter table contracts add column if not exists signed_client_name text;
alter table contracts add column if not exists body_sha256 text;
alter table contracts add column if not exists pdf_sha256 text;
alter table contracts add column if not exists sent_at timestamptz;
alter table contracts add column if not exists canceled_at timestamptz;

alter table contracts drop constraint if exists contracts_signature_complete;
alter table contracts add constraint contracts_signature_complete check (
  (status = 'completed') = (
    signer_name is not null and signed_at is not null and signer_ip is not null
    and signer_user_agent is not null and body_sha256 is not null and pdf_sha256 is not null
    and signed_title is not null and signed_client_name is not null
  )
);

create or replace function contracts_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only a draft contract can be deleted (this one is %)', old.status;
    end if;
    return old;
  end if;

  if old.status = 'completed' then
    raise exception 'A signed contract can''t be changed';
  end if;
  if old.status = 'canceled' then
    raise exception 'A canceled contract can''t be changed';
  end if;
  if new.filled_body is distinct from old.filled_body and old.status <> 'draft' then
    raise exception 'The contract text can''t change after it has been sent';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status = 'awaiting_signature') or
    (old.status = 'awaiting_signature' and new.status in ('canceled', 'completed'))
  ) then
    raise exception 'A contract can''t go from % to %', old.status, new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_guard on contracts;
create trigger contracts_guard before update or delete on contracts
  for each row execute function contracts_guard();

-- Audit trail. Rows are only ever inserted.
create table if not exists contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete restrict,
  event text not null check (event in ('sent', 'signed', 'canceled')),
  ip text,
  user_agent text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists contract_events_contract_idx on contract_events (contract_id, created_at);
alter table contract_events enable row level security;

create or replace function contract_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'The contract audit trail is append-only';
end;
$$;

drop trigger if exists contract_events_append_only on contract_events;
create trigger contract_events_append_only before update or delete on contract_events
  for each row execute function contract_events_append_only();

-- The only way a contract becomes completed. Returns false (and changes
-- nothing) if the contract isn't awaiting signature or its text no longer
-- matches what the client was shown.
create or replace function sign_contract(
  p_contract_id uuid,
  p_signer_name text,
  p_signer_email text,
  p_signed_at timestamptz,
  p_ip text,
  p_user_agent text,
  p_signed_title text,
  p_signed_client_name text,
  p_body_sha256 text,
  p_pdf_sha256 text
) returns boolean
language plpgsql as $$
begin
  update contracts set
    status = 'completed',
    signer_name = p_signer_name,
    signer_email = p_signer_email,
    signed_at = p_signed_at,
    signer_ip = p_ip,
    signer_user_agent = p_user_agent,
    signed_title = p_signed_title,
    signed_client_name = p_signed_client_name,
    body_sha256 = p_body_sha256,
    pdf_sha256 = p_pdf_sha256,
    updated_at = now()
  where id = p_contract_id
    and status = 'awaiting_signature'
    and encode(sha256(convert_to(filled_body, 'UTF8')), 'hex') = p_body_sha256;
  if not found then
    return false;
  end if;

  insert into contract_events (contract_id, event, ip, user_agent, detail)
  values (p_contract_id, 'signed', p_ip, p_user_agent,
          'Typed signature: ' || p_signer_name || '; document SHA-256 ' || p_body_sha256);
  return true;
end;
$$;

-- Callable by the service role only (the app's server code).
revoke all on function sign_contract(uuid, text, text, timestamptz, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function sign_contract(uuid, text, text, timestamptz, text, text, text, text, text, text) to service_role;
