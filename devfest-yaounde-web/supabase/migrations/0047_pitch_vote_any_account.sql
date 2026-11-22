-- 0047 — The pitch vote opens to anyone with an account (ADR 0099).
--
-- 0046 limited the vote to people checked in through this site's door
-- station. Most attendees came on free passes checked in on Bevy, and the
-- Bevy export at hand had every email masked, so they could not be matched.
-- The organisers therefore opened the vote to EVERY account on the site
-- (Google sign-in). Still up to two picks per account, one per project —
-- `set_pitch_votes` and the table's cap are unchanged.
--
-- Only the two functions that decide and count eligibility are replaced; the
-- check-in rules stay readable in 0046 if the vote is ever narrowed again.
--
-- Deploy order: either way round. Before this runs, only checked-in accounts
-- can vote (0046); after, every account can.

create or replace function public.pitch_vote_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from auth.users where id = p_user_id);
$fn$;

revoke all on function public.pitch_vote_eligible(uuid)
  from public, anon, authenticated;

create or replace function public.pitch_vote_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'eligible', (select count(*) from auth.users),
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
