# 0081 — DP generator: ask for a name, and one wall card per photo

Date: 2026-11-16
Status: Accepted

## Context

Two things seen on the live DP generator:

1. Cards going out with an empty name plate — mostly from phones, where the
   name field sits in the first tab of the bottom sheet and the export
   buttons in the last.
2. Duplicates on the community wall. Every Download, Share and Copy saved a
   copy (ADR 0034), so one person pressing two buttons, or downloading twice,
   appeared on the wall several times.

## Decision

1. **A name check before export.** Download, Share and Copy image open a
   small dialog (the shared `Modal`) when the name is empty: the name field,
   focused, "Add my name", and "Continue without a name". Adding the name
   also fills the generator's own field. Skipping is remembered for that
   photo, so nobody is asked twice. The dialog's button press is a fresh
   user gesture, so Share and Copy still work on phones afterwards.
   `Modal` gained `data-autofocus` to focus that field rather than the
   close button.

2. **One wall card per photo, per visit** (`planWallStash`, pure and
   tested). Each save fingerprints what is drawn on the card (name, style,
   effects, badge, shape, ratio, corners, stickers, framing, language) and
   compares it with the last card this visit put on the wall:
   - nothing yet, or a different photo → save it;
   - same photo, same card → send nothing;
   - same photo, edited card → save the new one, then take the old one down
     with its deletion token (best effort).

## Consequences

- The wall shows the version someone actually kept, not every draft.
- A reload starts a new visit: the same card saved again after a reload is
  a new wall card. The browser's stored deletion tokens would allow
  de-duplicating across visits too, but matching cards across reloads
  needs the photo, which never leaves the device — so this stops at a visit.
- If taking the old card down fails, both stay — no worse than before.
