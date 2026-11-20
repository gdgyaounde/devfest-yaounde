# 0094 — The agenda's merged cells: workshops and the pitch run 85 minutes

Date: 2026-11-20
Status: Accepted (corrects ADR 0085 / migration 0036)

## Context

The agenda spreadsheet uses merged cells for long sessions. 0036 read every cell as a single 25-minute slot, so the rows below a merged cell (10:20, 13:10, 13:40, 16:20 and parts of 10:50) were taken for empty.

## Decision

From the merged cells (and the PDF export, where the blue blocks are workshops): the four accepted workshops (09:50, Rooms 2–5) run until 11:15, the 09:20 Room 1 session until 10:45, the 15:20 Room 1 session until 16:45, and the Pitch Contest 12:40 to 14:05, all 85 minutes. The two agenda-only blue sessions become workshops. Migration 0042 applies this to the live row, only where the duration is still the old 25. A test now also fails if any session overruns the next one in its room.

## Consequences

Schedule cards, calendar files and the volunteer guide's day plan show the real lengths. The pitch window now matches the Impact Hub plan (15 teams at 3 minutes, plus the vote and Impact Hub's own slot).
