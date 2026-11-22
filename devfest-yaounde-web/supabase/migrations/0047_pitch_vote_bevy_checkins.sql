-- 0047 — Bevy check-ins can vote in the pitch contest too (ADR 0099).
--
-- Free passes were RSVP'd and checked in on Bevy, not through this site's
-- door station, so 0046 could not see those people. The organisers export
-- Bevy's attendee list; ONLY the rows with a check-in date are imported
-- (scripts/bevy-checkins-sql.ts turns the CSV into the SQL to run).
--
-- MINIMAL DATA: the table never holds an email. It holds a SHA-256 key of
-- the CANONICAL email (lower-cased and trimmed; for Gmail also without dots
-- and "+tags", since Google ignores both), plus how many checked-in people
-- registered under it. Voting compares the voter's own account email,
-- canonicalised and hashed the same way, against those keys.
-- `pitch_vote_email_key` below and `emailKey` in src/lib/email-key.ts must
-- stay identical; tests/db/pitch-votes.db.ts proves they agree.
--
-- Several people registered under one email count as ONE voter (the account
-- with that email): Bevy holds no separate email for the others.
--
-- Deploy order: apply after 0046. Until the import SQL is run the table is
-- empty and nothing changes for anyone.

create table if not exists public.bevy_checkins (
  email_key   text primary key check (email_key ~ '^[0-9a-f]{64}$'),
  -- Checked-in Bevy attendees registered under this email (for the record).
  people      integer not null default 1 check (people between 1 and 100),
  imported_at timestamptz not null default now()
);

comment on table public.bevy_checkins is
  'Bevy attendees checked in at DevFest 2026, as SHA-256 keys of their canonical email — never the email (ADR 0099). Service role only.';

alter table public.bevy_checkins enable row level security;

-- ------------------------------------------------------- pitch_vote_email_key ---

create or replace function public.pitch_vote_email_key(p_email text)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v_email  text := lower(trim(p_email));
  v_local  text;
  v_domain text;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+$' then
    return null;
  end if;
  v_local := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(split_part(v_local, '+', 1), '.', '');
    v_domain := 'gmail.com';
  end if;
  return encode(sha256(convert_to(v_local || '@' || v_domain, 'UTF8')), 'hex');
end;
$fn$;

revoke all on function public.pitch_vote_email_key(text)
  from public, anon, authenticated;

-- ------------------------------------------------------ pitch_vote_eligible ---
-- As in 0046, plus a third rule: a Bevy check-in under the account's email.

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
  ) or (
    v_email is not null
    and exists (
      select 1
        from public.bevy_checkins b
       where b.email_key = public.pitch_vote_email_key(v_email)
    )
  );
end;
$fn$;

revoke all on function public.pitch_vote_eligible(uuid)
  from public, anon, authenticated;

-- --------------------------------------------------------- pitch_vote_stats ---
-- As in 0046, with Bevy-eligible accounts in `eligible`, and how many Bevy
-- check-ins were imported (people, and distinct emails).

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
    union
    select u.id
      from auth.users u
      join public.bevy_checkins b
        on b.email_key = public.pitch_vote_email_key(u.email)
  )
  select jsonb_build_object(
    'eligible', (select count(*) from eligible),
    'voters', (select count(distinct user_id) from public.pitch_votes),
    'votes', (select count(*) from public.pitch_votes),
    'bevyEmails', (select count(*) from public.bevy_checkins),
    'bevyPeople', (select coalesce(sum(people), 0) from public.bevy_checkins),
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
