# The pitch contest public vote

After the event, the people who were checked in at the door can vote for up to **two** of their favourite pitches (one vote per project) at **/vote** (for example `devfest.gdgyaounde.com/fr/vote`). The page credits the contest's partner, Impact Hub Yaoundé, at the top.

Until voting closes, the banner at the top of every page links to it ("Vote now" / "Je vote"). Afterwards it goes back to the thank-you with "See the photos". A message typed in the dashboard's info bar still replaces the banner, as always.

## Turning it on (once)

1. In Supabase → SQL editor, run `supabase/migrations/0046_pitch_votes.sql`.
2. Open /vote, sign in with a Google account that was checked in, and vote. Then check **Dashboard → Community → Pitch vote**: you should see 1 vote.

Until step 1 is done, the page shows the projects and says "Voting opens very soon". Nothing can be voted.

## Who can vote

Only people checked in through the site's door station. Each picks one or two projects, and can remove a pick and choose another until the close:

- someone who bought their own ticket, or claimed one, and was checked in;
- someone a ticket was bought for, who was checked in. They sign in with the email that was on the ticket. The person who paid does **not** get that vote;
- someone who made a reservation that was checked in (and not cancelled);
- someone checked in on **Bevy** (free passes), once their check-ins are imported (below). They sign in with the Google account that has the same email as their Bevy registration. If someone says "it says my account wasn't checked in", ask which Google account they used for their ticket. The page lets them sign out and try another.

## Importing the Bevy check-ins

1. Run `supabase/migrations/0047_pitch_vote_bevy_checkins.sql` in Supabase (once).
2. On Bevy, as the event's organiser, export the attendee list as CSV, with **full** emails. Put it in the git-ignored `.private/` folder.
3. Run `npx tsx scripts/bevy-checkins-sql.ts .private/<the-file>.csv`. It keeps only the rows with a check-in date and writes `.private/bevy-checkins.sql`. That file holds no emails or names, only fingerprints (hashes) of the emails. The script prints counts.
4. Paste `.private/bevy-checkins.sql` into the Supabase SQL editor and run it. Re-running with a newer export replaces the old import.
5. The dashboard (Community → Pitch vote) then shows how many Bevy emails and people were imported.

If the script says the emails are **masked** (`j*****@gmail.com`), Bevy hid them in that export. Export again with full emails: a masked email can't be matched to anyone.

## Watching it and announcing the winner

- **Dashboard → Community → Pitch vote** shows the live tally, how many people voted, how many picks in all, and how many people could vote. The % next to each project is the share of voters who picked it. With two picks each, the percentages add up past 100%. **Export CSV** saves it.
- Voters don't see the results while voting is open.
- Voting closes on **Tuesday 24 November 2026 at 23:59** (Yaoundé time). From then on, /vote shows everyone the ranking, with the winner marked "Public's choice".

## Changing things

- **The closing time** is `VOTE_CLOSES_AT` in `src/lib/site-config.ts` (needs a deploy).
- **The projects** are in `src/data/pitch-projects.json`: name, team, a short tagline in French and English, the team's pitch, and an optional link and note. Keep each `id` lowercase with dashes, and never change the id of a project people have already voted for.
- **Next year:** replace the projects, move the closing time, and after saving this year's result run `truncate public.pitch_votes;` in Supabase.
