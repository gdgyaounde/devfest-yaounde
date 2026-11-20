# 0092 — Speaker check-in, a Reservations station, swag notes, and times in the viewer's zone

Date: 2026-11-20
Status: Accepted (builds on ADR 0079, 0084)

## Decision

- **Meal and swag stay separate stations/scans** (a person scans once at each; recorded independently), so they never get mixed up.
- **Speakers station** (`/volunteer/speakers`, staff and volunteers): speakers have no QR ticket, so it is a searchable list with two undoable buttons per speaker, Arrived and Swag collected, and an optional note. Stored in `speaker_checkins` (migration 0040, RLS on, no policies, service role only). No scanning and no eligibility rules.
- **Reservations is its own station** (`/volunteer/reservations`), no longer nested in the door screen.
- **Swag note:** at the swag table, after a bag is handed out, a free-text note ("got everything except the pen") is saved on the ticket (`tickets.swag_note`, 0040) through its own route, so the swag table works before the migration is applied. The admin overview has a "Day-of notes" panel listing speaker arrivals/swag and the swag notes.
- **Times in the viewer's zone:** a session card and the reader add "03:20 your time (EST)" (and "next day"/"previous day") when the visitor's zone differs from Yaoundé (`localTimeFor`, tested, derived from the event date and the session's Yaoundé time). Nothing is shown on Yaoundé time.

## Consequences

- Run migration 0040 to switch on the speaker list and swag notes; until then both say so politely and nothing else changes.
- Speaker marks are undoable by tapping again; every mark is audited.
