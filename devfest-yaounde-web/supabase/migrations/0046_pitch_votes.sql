-- 0046 — The pitch contest public vote (ADR 0099).
--
-- After DevFest Yaoundé 2026, the people who were THERE vote for the project
-- they liked best among the pitches (the contest powered by Impact Hub
-- Yaoundé). Each account picks UP TO TWO projects (one vote each, never two
-- on the same project), and can change its picks until voting closes.
--
-- WHO MAY VOTE — checked in through this site's door station, as the person
-- who was actually there (not whoever paid). Every checked-in ticket or
-- reservation maps to EXACTLY ONE account, so none can yield a second voter:
--   * a ticket the voter holds as their own (is_self) or claimed (0024):
--     the holder's account;
--   * a ticket bought for someone else, unclaimed: the account whose email
--     is the attendee email (case and spaces ignored) — never the payer;
--   * a checked-in, not-cancelled reservation: the account that made it.
-- Free passes were RSVP'd and checked in on Bevy, outside this database, so
-- they are not eligible here — an organiser decision, recorded in ADR 0099.
--
-- Everything goes through SECURITY DEFINER functions called with the service
-- role from /api/vote; the table has RLS on and no policies, so no client can
-- read or write a vote directly. The project list and the closing time live
-- in the application (src/data/pitch-projects.json, VOTE_CLOSES_AT), which
-- validates both before calling in.
--
-- Deploy order: the code ships first and FAILS CLOSED without this migration
-- (/api/vote answers 503 vote_unavailable, the page says voting isn't open
-- yet). Apply this, then the ballot works with no further deploy.

create table if not exists public.pitch_votes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  project_id text not null check (project_id ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  -- One vote per project per voter.
  primary key (user_id, project_id)
);

comment on table public.pitch_votes is
  'One row per (voter, project) picked — at most two per voter (ADR 0099). Service role only.';

alter table public.pitch_votes enable row level security;

-- At most two picks per voter, held by the TABLE, not only by the function
-- that writes it: a third row is refused however it arrives.
create or replace function public.pitch_votes_cap()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if (select count(*) from public.pitch_votes where user_id = new.user_id) >= 2 then
    raise exception 'at most two picks per voter' using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists pitch_votes_cap on public.pitch_votes;
create trigger pitch_votes_cap
  before insert on public.pitch_votes
  for each row execute function public.pitch_votes_cap();

-- ------------------------------------------------------ pitch_vote_eligible ---

create or replace function public.pitch_vote_eligible(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_email text;
begin
  -- The account's own email, from auth — never one supplied by a request.
  select lower(trim(email)) into v_email from auth.users where id = p_user_id;
  if not found then
    return false;
  end if;

  return exists (
    select 1
      from public.tickets t
     where t.checked_in_at is not null
       and (
         ((t.is_self or t.claimed_at is not null) and t.user_id = p_user_id)
         or (
           not t.is_self and t.claimed_at is null
           and v_email is not null
           and lower(trim(t.attendee_email)) = v_email
         )
       )
  ) or exists (
    select 1
      from public.reservations r
     where r.checked_in_at is not null
       and r.status <> 'cancelled'
       and r.user_id = p_user_id
  );
end;
$fn$;

revoke all on function public.pitch_vote_eligible(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------- set_pitch_votes ---
-- Replaces the voter's picks with the given set (0, 1 or 2 distinct projects)
-- in one transaction, under a per-voter lock so two quick taps can't race.

create or replace function public.set_pitch_votes(
  p_user_id     uuid,
  p_project_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ids text[];
begin
  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(coalesce(p_project_ids, '{}')) as x;
  if cardinality(v_ids) <> cardinality(coalesce(p_project_ids, '{}')) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  if cardinality(v_ids) > 2 then
    return jsonb_build_object('status', 'too_many');
  end if;
  if not public.pitch_vote_eligible(p_user_id) then
    return jsonb_build_object('status', 'not_eligible');
  end if;

  perform pg_advisory_xact_lock(hashtext('pitch_votes:' || p_user_id::text));
  delete from public.pitch_votes where user_id = p_user_id;
  insert into public.pitch_votes (user_id, project_id)
  select p_user_id, x from unnest(v_ids) as x;

  return jsonb_build_object('status', 'saved', 'projectIds', to_jsonb(v_ids));
end;
$fn$;

revoke all on function public.set_pitch_votes(uuid, text[])
  from public, anon, authenticated;

-- --------------------------------------------------------- pitch_vote_stats ---
-- The tally, plus how many accounts could vote at all — for the organisers'
-- dashboard live, and for the public results once voting has closed.

create or replace function public.pitch_vote_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  with eligible as (
    select t.user_id as id
      from public.tickets t
     where t.checked_in_at is not null and (t.is_self or t.claimed_at is not null)
    union
    select u.id
      from public.tickets t
      join auth.users u on lower(trim(u.email)) = lower(trim(t.attendee_email))
     where t.checked_in_at is not null and not t.is_self and t.claimed_at is null
    union
    select r.user_id
      from public.reservations r
     where r.checked_in_at is not null and r.status <> 'cancelled'
  )
  select jsonb_build_object(
    'eligible', (select count(*) from eligible),
    'voters', (select count(distinct user_id) from public.pitch_votes),
    'votes', (select count(*) from public.pitch_votes),
    'tally', coalesce(
      (select jsonb_object_agg(project_id, n)
         from (select project_id, count(*) as n
                 from public.pitch_votes
                group by project_id) x),
      '{}'::jsonb
    )
  );
$fn$;

revoke all on function public.pitch_vote_stats()
  from public, anon, authenticated;
