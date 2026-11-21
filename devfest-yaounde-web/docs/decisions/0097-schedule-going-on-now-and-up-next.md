# 0097 — "Going on now" and "Coming up next" on /schedule

Date: 2026-11-21
Status: Accepted

## Context

On the day the programme moved (rooms went from five to three, breaks shifted). Re-editing every session in the database mid-event would have spoiled the published programme and needed a migration for each change.

## Decision

Two rows pinned above the timeline on `/schedule`: **Going on now** and **Coming up next**, three cards each (room, title, speakers). They are read from `src/data/up-next.json` (`now` and `next`, each a list of `{ sessionId, room }`) and resolved against the live sessions by `src/lib/up-next.ts`. Unknown or hidden sessions are skipped; an empty row is not drawn. The programme itself is never edited.

(Not the same thing as `src/lib/spotlight.ts`, the daily speaker spotlight on the home page.)

## Consequences

Updating the rows is a one-file change and a normal deploy, with no SQL. The room shown is the one in the file, so a room change on the day does not touch the session. The cost is that it needs a deploy rather than a dashboard click; an admin editor could replace the file later.
