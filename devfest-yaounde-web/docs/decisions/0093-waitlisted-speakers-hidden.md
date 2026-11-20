# 0093 — Waitlisted speakers, kept on the site but hidden

Date: 2026-11-20
Status: Accepted

## Decision

The Sessionize export of every submission (statuses Accepted / Declined / Waitlisted) holds six waitlisted sessions, with seven people (one session has two speakers). They are added to `speakers.json` and `sessions.json` with `hidden: true`, with photos in `public/speakers/`, so an organiser can switch one on if a slot opens.

- **Sessions gain `hidden`.** Speakers already had it. `getSessions()` (what the public site reads) now filters hidden sessions; the dashboard reads `getAllSessions()` and gets a Show/Hide toggle on Schedule, like Speakers, so saving the list from the admin never drops a hidden one.
- Waitlisted sessions are unscheduled (no time, no room). Showing one is two steps: Show the speaker, Show the session, then give it a time.
- A speaker who left the icebreaker blank is allowed (the profile already shows nothing for a blank one).
- Migration `0041` is add-only and idempotent (it appends ids that are missing and changes nothing else), with a backup of both rows.
- Only name, role, bio, social links and photo are stored. No email, phone or address.

## Consequences

- Hidden speakers' photos are files in `public/speakers/`, reachable by URL for anyone who guesses the filename; the people are not listed or linked anywhere.
- The "24 speakers, 24 sessions" lineup tests now describe the public lineup (hidden excluded).
