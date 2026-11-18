-- ============================================================================
-- 0039 — Anonymous testimonials (ADR 0087)
--
-- Anyone can leave a few words about DevFest Yaoundé at /testimonial: a
-- message, and optionally their role and the edition it is about. No name, no
-- account, no email, no IP is stored — nothing here identifies the writer.
--
-- Every submission arrives as 'pending'. Only an organiser can approve it
-- (admin → Testimonials → Submissions), and only APPROVED ones are shown, on
-- the wall's "Stories" mode. Anonymous text on a projected screen is why.
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
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create index if not exists testimonials_status_idx
  on public.testimonials (status, created_at);

comment on table public.testimonials is
  'Anonymous testimonials (ADR 0087). Pending until an organiser approves. Service role only: RLS on, no policies.';

alter table public.testimonials enable row level security;
