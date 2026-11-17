# 0082 — Ticket perks list only what a pass adds; items live in the box

Date: 2026-11-17
Status: Accepted

## Context

Feedback on the live `/terms` table (and the same tiers on `/tickets`):
lots of repetition. Each paid pass said "Everything in <the pass below>"
and then listed "Lunch and coffee breaks" and "An event identifier" again —
ADR 0074 had added both to every paid pass explicitly. Physical items were
listed twice: as a perk ("This edition's t-shirt") and in the "In the box"
line built from the tier's swag. And some perk items did not match the box:
OPUS promised a tote bag its box did not have; FABLE's description promised
a "bottle and cap" where the box holds a mug and a bucket hat.

## Decision

- **Perks say what the pass gives you; each pass lists only what it adds**
  on top of an "Everything in …" line. Lunch and the identifier are listed
  once, on SONNET, and inherited by every pass above it.
- **Physical items live in one place — the swag list ("In the box").** Perks
  carry at most a summary of the kit.
- **The box is the truth.** Decided with the organiser: OPUS's tote-bag line
  goes (its box has none); MYTHOS keeps "Collector lanyard", which is handed
  out but is not a shop product. FABLE's description now names its box.
- Shipped as migration 0033 (guarded on the row's last save by 0031, backup
  first, only `perks` and FABLE's `description` change) and mirrored in
  `src/data/ticket-tiers.json`.
- The rule test now follows "Everything in …" lines, so it still proves every
  paid pass offers lunch and an identifier, and also fails if a pass repeats
  one it already inherits.

## Consequences

- The tiers read as a ladder instead of five near-identical lists.
- The organisers' guide has the wording rule, so dashboard edits don't
  reintroduce the repetition.
- Until 0033 is applied, the live site keeps the old wording.
