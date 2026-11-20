# 0096 — A live session brings its speakers onto /speakers

Date: 2026-11-20
Status: Accepted

## Decision

`getSpeakers()` (what every public page reads) now returns the speakers who are not hidden **plus any speaker with at least one live (non-hidden) session**. So when an organiser switches on a waitlisted session in Admin → Schedule, its speakers appear on /speakers without a second toggle, and a session on the programme can never lack its speaker's profile.

To keep someone off the site, hide their session as well as the speaker.

## Consequences

Hiding a speaker whose session is live has no effect until that session is hidden too. Today every live session's speaker is already visible, so nothing changes on the site.
