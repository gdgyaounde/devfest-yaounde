# 0086 — "This interests me": saved sessions and interest counts

Date: 2026-11-18
Status: Accepted

## Context

With the agenda online, signed-in attendees want to keep the sessions they care about, and the team wants to know which sessions draw interest, to plan rooms and seating. Not who marked what.

## Decision

- Table `session_interests (user_id, session_id)` (migration 0038): RLS on, no policies, service role only. `session_id` is the content id, not a foreign key, because sessions are editable content.
- `/api/interests`: GET (own list; empty and `signedIn:false` for visitors), POST `{sessionId, interested}`. Same-origin, signed-in, rate-limited, session id must exist, at most 60 per account.
- A heart icon button (named "This interests me", `aria-pressed`) at the top right of each session card and in the full-screen reader. Shown ONLY to signed-in people — visitors see nothing. Only on `/schedule`.
- Account → "My sessions" lists them with a remove button.
- Admin overview: an "Interested" stat and a "Session interest" table (counts, CSV export) from `session_interest_counts()`, which returns counts only. No admin screen can see who marked what.

## Consequences

- Until 0038 is applied the heart answers "not available" and the admin count reads zero; nothing else breaks.
- Marks are personal data only in the table, which nothing but the API can read.
