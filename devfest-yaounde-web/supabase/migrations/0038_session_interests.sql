-- ============================================================================
-- 0038 — "This interests me": signed-in people mark agenda sessions (ADR 0086)
--
-- One row per (account, session). It powers two things: a "My sessions" list
-- in the person's account, and a per-session COUNT in the admin. The admin
-- never sees who marked what: `session_interest_counts()` returns only
-- (session_id, count), and the table itself is not readable by any session.
--
-- Same posture as `reservations` (0034) and `volunteers` (0032): RLS ON and NO
-- policies, so only the service role (the API routes) can touch it.
--
-- `session_id` is the id from the sessions content collection. It is text and
-- deliberately NOT a foreign key: sessions live in editable content, not in a
-- table, and an edited or removed session must not break anyone's list.
--
-- DEPLOY ORDER: either way is safe. Until it is applied, "This interests me"
-- answers "not available right now" and the admin count reads as zero; nothing
-- else changes. It is never applied automatically by the app.
-- ============================================================================

create table if not exists public.session_interests (
  user_id    uuid not null references auth.users (id) on delete cascade,
  session_id text not null check (char_length(session_id) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

create index if not exists session_interests_session_idx
  on public.session_interests (session_id);

comment on table public.session_interests is
  'Sessions a signed-in person marked "this interests me" (ADR 0086). Service role only: RLS on, no policies.';

alter table public.session_interests enable row level security;

-- Counts only — never who. Used by the admin overview.
create or replace function public.session_interest_counts()
returns table (session_id text, interested bigint)
language sql
security definer
set search_path = public
stable
as $fn$
  select session_id, count(*)::bigint
    from public.session_interests
   group by session_id
   order by count(*) desc, session_id;
$fn$;

revoke all on function public.session_interest_counts()
  from public, anon, authenticated;
