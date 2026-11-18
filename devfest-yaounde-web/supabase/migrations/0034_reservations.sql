-- ============================================================================
-- 0034 — Reservations: reserve now, pay cash at the venue (ADR 0084)
--
-- From Wed 18 Nov 12:00 NO payment passes through the platform. Tickets and
-- shop items are RESERVED instead (until Fri 20 Nov 17:00), and paid in cash
-- at the venue. This table records what was reserved so the team can prepare
-- stock, shirts and cash, and so volunteers can find a reservation at the
-- door, mark the cash as received and check the person in.
--
-- Same posture as `volunteers` (0032): RLS ON and NO policies, so no session
-- can read or write it; only the service role (the API routes) can. A
-- reservation is personal data (name, phone), and nothing here needs a
-- browser to read it.
--
-- The rules that matter live HERE, in the functions, not only in the route:
--   * `create_reservation` — under ONE lock, so two people cannot both take
--     the last seats: counts paid tickets AND active reservations per tier
--     against the tier's cap, and caps how many active reservations one
--     account can hold.
--   * `cancel_reservation` — only the owner, only while it is still 'reserved'.
--   * `set_reservation_cash` / `check_in_reservation` — the door; row-locked
--     and idempotent, so two phones cannot both record the same cash.
--
-- The deadline (Friday 17:00) is enforced by the API route from the site
-- settings, because the settings are not in the database as columns.
--
-- DEPLOY ORDER: apply AFTER the code is deployed or before — either is safe.
-- Until it is applied, reserving shows "reservations are not available right
-- now" and changes nothing (the RPC does not exist → the route fails closed).
-- It is never applied automatically by the app.
-- ============================================================================

create table if not exists public.reservations (
  id               uuid primary key default gen_random_uuid(),
  -- Short, unambiguous, printed on the confirmation: what the person quotes.
  reference        text not null unique,
  user_id          uuid not null references auth.users (id) on delete cascade,
  contact_name     text not null,
  contact_phone    text not null,
  contact_email    text,
  -- [{ "tierId": "sonnet", "name": "Ada Fotso", "apparelSize": "M" }, …]
  -- One element per ticket, so counting a tier is counting elements.
  tickets          jsonb not null default '[]'::jsonb,
  -- [{ "productId": "tee-edition", "quantity": 1, "variant": {...} }, …]
  items            jsonb not null default '[]'::jsonb,
  -- Base prices (cash at the venue has no online fee), computed server-side.
  total_xaf        integer not null check (total_xaf >= 0),
  status           text not null default 'reserved'
                     check (status in ('reserved', 'cash_received', 'cancelled')),
  cash_received_at timestamptz,
  cash_received_by uuid references auth.users (id) on delete set null,
  checked_in_at    timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  check (jsonb_array_length(tickets) + jsonb_array_length(items) > 0)
);

create index if not exists reservations_user_idx on public.reservations (user_id);
create index if not exists reservations_status_idx on public.reservations (status);

comment on table public.reservations is
  'Reserve now, pay cash at the venue (ADR 0084). Service role only: RLS on, no policies. Holds name + phone.';

alter table public.reservations enable row level security;

-- ------------------------------------------------------- create_reservation ---

create or replace function public.create_reservation(
  p_user_id       uuid,
  p_reference     text,
  p_contact_name  text,
  p_contact_phone text,
  p_contact_email text,
  p_tickets       jsonb,
  p_items         jsonb,
  p_total_xaf     integer,
  -- { "<tierId>": <cap or null> } for the tiers in p_tickets
  p_caps          jsonb,
  p_max_active    integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tier   text;
  v_cap    integer;
  v_asked  integer;
  v_taken  integer;
  v_active integer;
  v_id     uuid;
begin
  -- ONE lock for every reservation: two people reserving the last seats queue
  -- here, and the second one counts what the first left behind.
  perform pg_advisory_xact_lock(hashtext('devfest:reservations'));

  select count(*) into v_active
    from public.reservations
   where user_id = p_user_id and status in ('reserved', 'cash_received');
  if v_active >= p_max_active then
    return jsonb_build_object('status', 'too_many');
  end if;

  for v_tier in
    select distinct t ->> 'tierId' from jsonb_array_elements(p_tickets) t
  loop
    v_cap := nullif(p_caps ->> v_tier, '')::integer;
    continue when v_cap is null;  -- uncapped tier

    select count(*) into v_asked
      from jsonb_array_elements(p_tickets) t where t ->> 'tierId' = v_tier;

    -- Seats already gone: paid tickets + tickets in live reservations.
    select (select count(*) from public.tickets where tier_id = v_tier)
         + coalesce((
             select count(*)
               from public.reservations r,
                    jsonb_array_elements(r.tickets) t
              where r.status in ('reserved', 'cash_received')
                and t ->> 'tierId' = v_tier
           ), 0)
      into v_taken;

    if v_taken + v_asked > v_cap then
      return jsonb_build_object('status', 'tier_full', 'tierId', v_tier);
    end if;
  end loop;

  begin
    insert into public.reservations (
      reference, user_id, contact_name, contact_phone, contact_email,
      tickets, items, total_xaf
    ) values (
      p_reference, p_user_id, p_contact_name, p_contact_phone,
      nullif(p_contact_email, ''), p_tickets, p_items, p_total_xaf
    ) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('status', 'reference_taken');
  end;

  return jsonb_build_object('status', 'ok', 'id', v_id, 'reference', p_reference);
end;
$fn$;

revoke all on function public.create_reservation(
  uuid, text, text, text, text, jsonb, jsonb, integer, jsonb, integer
) from public, anon, authenticated;

-- ------------------------------------------------------- cancel_reservation ---

create or replace function public.cancel_reservation(
  p_id      uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v public.reservations%rowtype;
begin
  select * into v from public.reservations
   where id = p_id and user_id = p_user_id for update;
  if not found then return 'not_found'; end if;
  if v.status = 'cancelled' then return 'already'; end if;
  -- Once the cash is taken it is a real transaction between people at the
  -- venue; undoing it is for an organiser, not a button.
  if v.status <> 'reserved' then return 'not_cancellable'; end if;

  update public.reservations
     set status = 'cancelled', cancelled_at = now()
   where id = p_id;
  return 'ok';
end;
$fn$;

revoke all on function public.cancel_reservation(uuid, uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------- set_reservation_cash ---

create or replace function public.set_reservation_cash(
  p_id    uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v public.reservations%rowtype;
begin
  select * into v from public.reservations where id = p_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  end if;
  if v.status = 'cash_received' then
    return jsonb_build_object(
      'status', 'already_received', 'cashReceivedAt', v.cash_received_at
    );
  end if;

  update public.reservations
     set status = 'cash_received', cash_received_at = now(),
         cash_received_by = p_actor
   where id = p_id;
  return jsonb_build_object('status', 'received', 'cashReceivedAt', now());
end;
$fn$;

revoke all on function public.set_reservation_cash(uuid, uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------- check_in_reservation ---

create or replace function public.check_in_reservation(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v public.reservations%rowtype;
begin
  select * into v from public.reservations where id = p_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  end if;
  if v.checked_in_at is not null then
    return jsonb_build_object(
      'status', 'already_checked_in', 'checkedInAt', v.checked_in_at
    );
  end if;

  update public.reservations set checked_in_at = now() where id = p_id;
  return jsonb_build_object('status', 'checked_in', 'checkedInAt', now());
end;
$fn$;

revoke all on function public.check_in_reservation(uuid)
  from public, anon, authenticated;
