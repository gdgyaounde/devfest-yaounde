# The pitch contest public vote

After the event, **anyone with an account on the site** (Google sign-in) can vote for up to **two** of their favourite pitches (one vote per project) at **/vote** (for example `devfest.gdgyaounde.com/fr/vote`). The page credits the contest's partner, Impact Hub Yaoundé, at the top.

Until voting closes, the banner at the top of every page links to it ("Vote now" / "Je vote"), and first-time visitors get a pop-up inviting them to vote (once per browser, never on /vote itself). Afterwards it goes back to the thank-you with "See the photos". A message typed in the dashboard's info bar still replaces the banner, as always.

## Turning it on (once)

1. In Supabase → SQL editor, run `supabase/migrations/0046_pitch_votes.sql`, then `0047_pitch_vote_any_account.sql`.
2. Open /vote, sign in with Google, and vote. Then check **Dashboard → Community → Pitch vote**: you should see 1 vote.

Until step 1 is done, the page shows the projects and says "Voting opens very soon". Nothing can be voted.

## Who can vote

Anyone who signs in with Google, since migration `0047_pitch_vote_any_account.sql`. Each person picks one or two projects, and can remove a pick and choose another until the close.

The vote first started limited to people checked in at the site's door (migration 0046). It was opened to every account the same day, because most attendees were checked in on Bevy and the Bevy export had their emails hidden. To narrow it again, a new migration can restore the 0046 version of `pitch_vote_eligible`.

## Watching it and announcing the winner

- **Dashboard → Community → Pitch vote** shows the live tally, how many people voted, how many picks in all, and how many people could vote. The % next to each project is the share of voters who picked it. With two picks each, the percentages add up past 100%. **Export CSV** saves it.
- Voters don't see the results while voting is open.
- Voting closes on **Tuesday 24 November 2026 at 23:59** (Yaoundé time). From then on, /vote shows everyone the ranking, with the winner marked "Public's choice".

## Changing things

- **The closing time** is `VOTE_CLOSES_AT` in `src/lib/site-config.ts` (needs a deploy).
- **The projects** are in `src/data/pitch-projects.json`: name, team, a short tagline in French and English, the team's pitch, and an optional link and note. Keep each `id` lowercase with dashes, and never change the id of a project people have already voted for.
- **Next year:** replace the projects, move the closing time, and after saving this year's result run `truncate public.pitch_votes;` in Supabase.
