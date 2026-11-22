# 0099 — The pitch contest public vote

Date: 2026-11-22
Status: Accepted

## Context

Seven teams pitched at DevFest Yaoundé 2026 (21 November), in a contest powered by Impact Hub Yaoundé. The day after, the organisers wanted the public to vote for their favourite project, but only people who were actually there, meaning checked in at the door.

Two facts shaped the design:

- **Sign-in is Google only** (ADR 0014), so the voter is an account, and the only identity we can trust is the account's id and its own email.
- **Most attendees came on free passes, RSVP'd and checked in on Bevy.** Our database only knows the people checked in through this site's door station: about 27 accounts (21 tickets, 6 reservations). The organisers chose to keep the vote to those ("our check-ins only") rather than import Bevy's list.

## Decision

- **`/vote`** (both locales, not indexed) lists the seven projects in pitch order: name, team, a short bilingual tagline (ours), the team's own pitch in French behind "Read their pitch", and a link to try it. The contest's partner is credited at the top: "Powered by" with Impact Hub Yaoundé's logo, sitting plainly on the page, linking to their site. The logo file itself (`public/sponsors/impact-hub-yaounde.png`, used everywhere on the site) was cleaned to match: the supplied artwork came on a slightly tilted white plate, so it was straightened and the plate and letter counters made transparent.
- **Who may vote is decided in the database** (`pitch_vote_eligible`, migration 0046), never in the browser or from anything a request carries. Every checked-in ticket or reservation maps to **exactly one account**, so none can produce a second voter:
  - your own ticket (`is_self`) or one you claimed: your account;
  - a ticket someone bought for you: the account whose email is the ticket's attendee email (case and spaces ignored), never the payer;
  - a checked-in, not-cancelled reservation: the account that made it;
  - **a Bevy check-in** (migration 0047, added the same day at the organisers' request): the account whose email matches a checked-in row of Bevy's attendee export.
- **Up to two picks per account, one vote per project, changeable until the close.** The browser sends the voter's whole set (none, one or two projects), and `set_pitch_votes` replaces it in one transaction under a per-voter lock. The table holds the rule on its own as well: its primary key is (voter, project), and a trigger refuses a third row however it arrives.
- **Closes Tuesday 24 November 2026, 23:59 (Douala)**, as `VOTE_CLOSES_AT` in `src/lib/site-config.ts`. The API refuses votes from then on.
- **Results are hidden while voting is open.** Organisers see the live tally, turnout and eligible count in the dashboard (Community → Pitch vote, CSV export). Once voting closes, `/vote` shows everyone the ranking: votes per project and the share of VOTERS who picked it (with two picks each, the shares add up past 100%). Ties share a rank, and the top project is badged "Public's choice". Counts only, never who voted for what.
- **The banner points at it.** While the vote is open, the thank-you banner reads "…vote for up to two favourite pitches until {date}" with a "Vote now" button to `/vote` (new wording, so people who dismissed the plain thank-you see it again). It hides itself at the close, and the revalidation sweep (`withinSalesCloseRevalidateWindow`, which now includes `VOTE_CLOSES_AT`) brings back the thank-you with the album button within minutes.
- **The table and its functions are service-role only**: RLS on, no policies, execute revoked from `anon` and `authenticated`. `/api/vote` checks the origin, requires sign-in, is rate-limited (per account, or per IP when signed out), validates the project id against the ballot (`zod` enum, plus a database check on its shape), and **fails closed**: before 0046 is applied, it writes nothing and the page says voting opens soon.

## Consequences

- **Bevy check-ins, with minimal data.** `bevy_checkins` never holds an email: only a SHA-256 key of the canonical email (lower-cased, trimmed; Gmail also without dots and `+tags`), and how many checked-in people registered under it. The voter's account email is canonicalised and hashed the same way (`pitch_vote_email_key` in SQL, `emailKey` in `src/lib/email-key.ts`; a database test proves the two agree). `scripts/bevy-checkins-sql.ts` turns the export into the SQL to run, keeping only rows with a check-in date and writing it to the git-ignored `.private/`.
- **Bevy can mask emails** in its export (`j*****@gmail.com`): the first export the organisers had was masked on every row. A masked email matches nobody, so the script refuses to write anything while any are present and asks for a full export, made as the event's organiser.
- Several people registered on Bevy under ONE email count as one voter: Bevy holds no separate email for the others.
- A reservation covering several people gives one voter (the account that made it), because we don't hold the other people's emails.
- Proven against a real Postgres engine in `tests/db/pitch-votes.db.ts` (PGlite, in memory, migration applied verbatim), covering every eligibility rule, the two-pick limit (in the function and in the table), stats and privileges. The ballot rules are in `tests/pitch-vote.test.ts`.
- Next year: replace `src/data/pitch-projects.json`, move `VOTE_CLOSES_AT`, and clear `pitch_votes` (`truncate public.pitch_votes;`) after saving last year's result.
