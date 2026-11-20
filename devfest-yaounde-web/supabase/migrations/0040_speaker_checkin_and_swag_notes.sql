-- ============================================================================
-- 0040 — Speaker check-in, and a note when part of a swag bag ran out (ADR 0092)
--
-- 1. SPEAKER CHECK-IN. Speakers have no QR ticket, so the day-of team simply
--    marks them: arrived, and whether they collected their swag. One row per
--    speaker (the id from the speakers content collection), written only
--    through the staff API on the service role. Like `reservations`,
--    `volunteers` and `session_interests`: RLS ON and NO policies.
--
-- 2. SWAG NOTES. When stock runs out and someone gets all of their box except
--    one item ("everything but the pen"), the volunteer writes that down. A
--    free-text note on the ticket (`swag_note`) and on the speaker row.
--
-- DEPLOY ORDER: apply AFTER the code is live OR before — either is safe. The
-- station pages read these columns/tables only from their own routes, so the
-- door, the meal table and the swag table keep working until it is applied;
-- until then the speaker station says it isn't available yet and saving a note
-- says so (nothing else changes). Never applied automatically by the app.
-- ============================================================================

create table if not exists public.speaker_checkins (
  speaker_id        text primary key
                      check (char_length(speaker_id) between 1 and 120),
  checked_in_at     timestamptz,
  swag_collected_at timestamptz,
  note              text check (note is null or char_length(note) <= 500),
  updated_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now()
);

comment on table public.speaker_checkins is
  'Speaker arrival + swag collection, marked by day-of staff (ADR 0092). Service role only: RLS on, no policies.';

alter table public.speaker_checkins enable row level security;

alter table public.tickets
  add column if not exists swag_note text
    check (swag_note is null or char_length(swag_note) <= 500);

comment on column public.tickets.swag_note is
  'Free text written at the swag table when part of the bag ran out (ADR 0092).';
