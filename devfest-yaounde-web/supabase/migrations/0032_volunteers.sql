-- ============================================================================
-- 0032 — Volunteers: day-of access without the dashboard (ADR 0079)
--
-- Volunteers run the door, the food/swag table and the merch table. They must
-- NOT be organisers: `is_organiser()` backs the RLS read policies on tickets,
-- payment intents, payment events, the editorial store, the DP wall and the
-- refund tracker, so an organiser row is a read grant over all of it.
--
-- So volunteers get their own table with RLS ON and NO policies at all: no
-- session can read it, only the service role. Everything a volunteer does goes
-- through a server route that checks membership (and expiry) and returns only
-- what that screen needs.
--
--   * `volunteers`            — membership, with a hard expiry.
--   * `set_volunteer()`       — the one audited way to add/remove, organisers
--                               only, re-checked inside an advisory lock.
--   * tickets.meal_collected_at / swag_collected_at — paid perks handed out.
--   * `collect_ticket_perk()` — marks one perk, race-safe (FOR UPDATE), so two
--                               tables cannot both hand out the same meal.
--
-- Perk ELIGIBILITY (which pass includes what) is decided by the route, because
-- tiers live in the editorial store as JSON, not in a table.
--
-- DEPLOY ORDER: apply BEFORE the code that calls it. Until it is applied the
-- volunteer pages 404 for volunteers (membership lookup fails closed),
-- organisers still reach them, and meal/swag/volunteer actions return 500 and
-- change nothing. It is never applied automatically by the app.
-- ============================================================================

create table if not exists public.volunteers (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  added_by   uuid references auth.users (id) on delete set null,
  added_at   timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.volunteers is
  'Day-of helpers (ADR 0079): door check-in, meal/swag hand-out, merch pickup. NOT organisers — no dashboard, no RLS read grants. Access ends at expires_at. Managed from Admin → Users.';

-- RLS on, no policies: invisible to every session; the service role only.
alter table public.volunteers enable row level security;

alter table public.tickets
  add column if not exists meal_collected_at timestamptz,
  add column if not exists swag_collected_at timestamptz;

comment on column public.tickets.meal_collected_at is
  'When the holder collected the meal included in a paid pass (ADR 0079). Null = not yet.';
comment on column public.tickets.swag_collected_at is
  'When the holder collected the swag included in a paid pass (ADR 0079). Null = not yet.';

-- --------------------------------------------------------- set_volunteer ---

create or replace function public.set_volunteer(
  p_actor      uuid,
  p_target     uuid,
  p_action     text,
  p_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_action not in ('add', 'remove') then
    raise exception 'set_volunteer: unknown action %', p_action;
  end if;

  -- Same lock as admin changes: membership changes queue behind each other,
  -- and an admin demoted a moment ago cannot finish adding a volunteer.
  perform pg_advisory_xact_lock(hashtext('devfest:organiser-membership'));

  if not exists (select 1 from public.organisers where user_id = p_actor) then
    insert into public.admin_audit (actor, action, target, before, after)
      values (p_actor, 'volunteer.change_refused', p_target::text,
              jsonb_build_object('attempted', p_action),
              jsonb_build_object('reason', 'actor_not_admin'));
    return 'actor_not_admin';
  end if;

  if p_action = 'add' then
    -- An admin already has everything a volunteer has, and more; a second
    -- row would only make "remove volunteer" look like it removed access.
    if exists (select 1 from public.organisers where user_id = p_target) then
      return 'already_admin';
    end if;
    if p_expires_at is null or p_expires_at <= now() then
      return 'bad_expiry';
    end if;

    insert into public.volunteers (user_id, added_by, expires_at)
      values (p_target, p_actor, p_expires_at)
      on conflict (user_id) do update
        set expires_at = excluded.expires_at,
            added_by   = excluded.added_by,
            added_at   = now();

    insert into public.admin_audit (actor, action, target, after)
      values (p_actor, 'volunteer.add', p_target::text,
              jsonb_build_object('expiresAt', p_expires_at));
    return 'ok';
  end if;

  delete from public.volunteers where user_id = p_target;
  if not found then
    return 'not_volunteer';
  end if;
  insert into public.admin_audit (actor, action, target)
    values (p_actor, 'volunteer.remove', p_target::text);
  return 'ok';
end;
$fn$;

revoke all on function public.set_volunteer(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

-- --------------------------------------------------- collect_ticket_perk ---

create or replace function public.collect_ticket_perk(
  p_ticket_id uuid,
  p_perk      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ticket public.tickets%rowtype;
  v_at     timestamptz;
begin
  if p_perk not in ('meal', 'swag') then
    raise exception 'collect_ticket_perk: unknown perk %', p_perk;
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_at := case p_perk when 'meal' then v_ticket.meal_collected_at
                      else v_ticket.swag_collected_at end;
  if v_at is not null then
    return jsonb_build_object('status', 'already_collected', 'collectedAt', v_at);
  end if;

  if p_perk = 'meal' then
    update public.tickets set meal_collected_at = now() where id = p_ticket_id;
  else
    update public.tickets set swag_collected_at = now() where id = p_ticket_id;
  end if;

  return jsonb_build_object('status', 'collected', 'collectedAt', now());
end;
$fn$;

revoke all on function public.collect_ticket_perk(uuid, text)
  from public, anon, authenticated;
