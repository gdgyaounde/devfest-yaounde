# The pitch contest public vote

After the event, the people who were checked in at the door can vote for their favourite pitch at **/vote** (for example `devfest.gdgyaounde.com/fr/vote`). The page credits the contest's partner, Impact Hub Yaoundé, at the top.

## Turning it on (once)

1. In Supabase → SQL editor, run `supabase/migrations/0046_pitch_votes.sql`.
2. Open /vote, sign in with a Google account that was checked in, and vote. Then check **Dashboard → Community → Pitch vote**: you should see 1 vote.

Until step 1 is done, the page shows the projects and says "Voting opens very soon". Nothing can be voted.

## Who can vote

Only people checked in through the site's door station, once each:

- someone who bought their own ticket, or claimed one, and was checked in;
- someone a ticket was bought for, who was checked in. They sign in with the email that was on the ticket. The person who paid does **not** get that vote;
- someone who made a reservation that was checked in (and not cancelled).

People who only came on a free Bevy pass were checked in on Bevy, not here, so they can't vote. If someone says "it says my account wasn't checked in", ask which Google account they used for their ticket. The page lets them sign out and try another.

## Watching it and announcing the winner

- **Dashboard → Community → Pitch vote** shows the live tally, how many people voted, and how many could. **Export CSV** saves it.
- Voters don't see the results while voting is open.
- Voting closes on **Tuesday 24 November 2026 at 23:59** (Yaoundé time). From then on, /vote shows everyone the ranking, with the winner marked "Public's choice".

## Changing things

- **The closing time** is `VOTE_CLOSES_AT` in `src/lib/site-config.ts` (needs a deploy).
- **The projects** are in `src/data/pitch-projects.json`: name, team, a short tagline in French and English, the team's pitch, and an optional link and note. Keep each `id` lowercase with dashes, and never change the id of a project people have already voted for.
- **Next year:** replace the projects, move the closing time, and after saving this year's result run `truncate public.pitch_votes;` in Supabase.
