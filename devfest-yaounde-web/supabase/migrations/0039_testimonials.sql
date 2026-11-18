-- ============================================================================
-- 0039 — Anonymous testimonials (ADR 0087)
--
-- Anyone can leave a few words about DevFest Yaoundé at /storytime: a
-- message, and optionally their role and the edition it is about. No name, no
-- account, no email, no IP is stored — nothing here identifies the writer.
--
-- Every submission is APPROVED on arrival and joins the wall's "Stories"
-- straight away. Organisers can still take one off the wall ('rejected') or
-- delete it from admin -> Testimonials -> Submissions; 'pending' remains
-- available should the team ever want to review before showing.
--
-- RLS ON and NO policies: only the service role (the API routes) reads or
-- writes this table, like `reservations` (0034) and `session_interests`
-- (0038).
--
-- DEPLOY ORDER: either way is safe. Before it is applied the form answers
-- "not available right now" and the Stories mode is empty.
-- ============================================================================

create table if not exists public.testimonials (
  id          uuid primary key default gen_random_uuid(),
  message     text not null check (char_length(message) between 20 and 280),
  role        text check (role is null or char_length(role) between 1 and 60),
  edition     text check (edition is null or char_length(edition) between 1 and 40),
  -- The language the page was in when it was written ("fr" | "en").
  locale      text not null default 'fr' check (locale in ('fr', 'en')),
  status      text not null default 'approved'
                check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create index if not exists testimonials_status_idx
  on public.testimonials (status, created_at);

comment on table public.testimonials is
  'Anonymous testimonials (ADR 0087). Shown on arrival; organisers can take one off the wall or delete it. Service role only: RLS on, no policies.';

alter table public.testimonials enable row level security;
