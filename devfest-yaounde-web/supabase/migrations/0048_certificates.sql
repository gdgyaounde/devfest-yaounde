-- 0048 — Event certificates, verifiable on the site (ADR 0100).
--
-- The certificates are made and emailed by the Google Apps Script in
-- tools/certificates/ (one Google Sheet, a Slides template, Gmail). When the
-- script generates a certificate it records it here through
-- POST /api/certificates/issue (a shared secret), so the QR code printed on
-- the PDF can prove it is genuine at /certificates/<id>.
--
-- MINIMAL DATA: the name, the role, the edition and what it was for — the
-- things printed on the certificate itself. NEVER the email address.
--
-- Service role only: RLS on, no policies. The verify page reads ONE row by
-- its exact id; nothing lists or searches the table publicly.
--
-- Deploy order: either way round. Until this runs, /api/certificates/issue
-- answers 503 and the verify page says it can't find the certificate.

create table if not exists public.certificates (
  id          text primary key
                check (id ~ '^[A-Z][A-Z0-9]{1,9}-[0-9]{3,6}$'),
  edition     integer not null check (edition between 2020 and 2100),
  full_name   text not null check (char_length(full_name) between 1 and 120),
  role        text not null
                check (role in ('attendee', 'speaker', 'volunteer', 'organiser', 'partner')),
  detail      text check (detail is null or char_length(detail) <= 200),
  issued_at   timestamptz not null default now(),
  -- Set by an organiser from the dashboard; the verify page then says so.
  revoked_at  timestamptz,
  updated_at  timestamptz not null default now()
);

comment on table public.certificates is
  'Event certificates issued by the Apps Script (ADR 0100): what is printed on them, never an email. Service role only.';

create index if not exists certificates_edition_idx
  on public.certificates (edition, issued_at desc);

alter table public.certificates enable row level security;
