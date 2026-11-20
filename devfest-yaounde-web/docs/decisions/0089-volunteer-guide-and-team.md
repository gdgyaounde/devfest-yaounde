# 0089 — The volunteer guide and the team list, inside /volunteer

Date: 2026-11-20
Status: Accepted (builds on ADR 0079)

## Context

The day-of tools were self-explanatory to an organiser but not to a first-time volunteer the evening before the event: nothing explained the day, the stations, the pay-at-the-venue flow, or what to do when something fails. Volunteers also had no way to see who else was helping.

## Decision

- `/volunteer/guide`: a single bilingual page, in reading order — welcome, 5-minute prep, the day hour by hour (from the agenda), door check-in, reserved-online/cash at the venue, meal & goodies, merch pickup, when something goes wrong (including "offline: nothing can be checked, on purpose"), and data care. Plain steps, with tips and a boxed warning where a mistake costs something. The hub's first tile links to it.
- `/volunteer/team`: organisers and active volunteers by display name and Google photo only (`googleAvatarUrl`'s host check applies), "You" marked. No email, no phone. Behind the same gate as every volunteer page; reads through the service role and fails to an empty list.
- Copy lives in `messages` (`staff.guide`, `staff.team`, `staff.hub`), with a test that both languages carry the same sections, steps and notes.

## Consequences

- Station hours are not invented: the guide says the organiser confirms them at the briefing.
- If the day's plan changes, the guide is a message edit, not a code change.
