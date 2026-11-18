# 0085 — Agenda online, community partners, full venue name

Date: 2026-11-18
Status: Accepted

## Context

Three days before the event the organisers sent the final agenda, two new community partners (Impact Hub Yaoundé, Tech Innovation Center), and the venue's full name.

## Decision

- **Agenda.** `sessions.json` now holds 36 entries: the 24 accepted sessions (time, length, room), five agenda-only talks (title only, no speaker), and the fixed items (check-in, opening, breaks, partner words, pitch, closing). Rooms are the five of the "Programme 2026" sheet. Source workbook stays in the gitignored `.private/` folder.
- **Partners.** Added to `sponsors.json` with tier `community`. The home strip drops the empty seats and keeps the "Become a sponsor" CTA on the same single row.
- **Venue.** `EVENT.venueFull` (fr/en) is shown in the venue band, venue card and structured data; the short "FMSB Yaoundé" stays in banners and the hero.
- **Pop-up.** A third step, "Our agenda is live", shown once, never on `/schedule` or `/reserve`.
- **Banner.** Selling and reserving messages carry the event date and venue again.
- **Admin.** Overview shows reservations, cash to collect and cash received.
- **FAQs.** Answers rewritten for reservations / cash at the venue; new "agenda" question.

## Consequences

- Live `sessions` and `sponsors` rows override the JSON, so the change ships as migration `0036_agenda_and_partners.sql` (guarded: backs up both rows and refuses if either was edited since).
- `EVENT.startTime/endTime` (09:00/18:00, structured data only) were left alone though the agenda runs 08:00–19:00.
- Tests that pinned the real clock to "before noon" now mock it.

## Follow-up (same day)

- Every agenda entry now has a short bilingual description (welcome, opening keynote by the team, breaks, partner words, pitch contest from the Impact Hub partnership, closing as a thank-you and safe-journey note, plus the five title-only talks). `partnerIds` on a session shows partner logos on its card (partner words, pitch).
- `sticker` on a sponsor swaps the tier mark for an icon: Impact Hub Yaoundé = incubator (egg), TiC = venue (building). Icons only; the roles are not spelled out on the page, only in the pop-up.
- Pop-up gained a step 3 "Welcome to our new partners" (button: thank you) before the agenda step; sponsor logos are bigger and further apart, and the row never scrolls.
- Migration `0037_agenda_descriptions_and_stickers.sql` fills only still-empty descriptions and missing stickers, so dashboard edits are never overwritten.
