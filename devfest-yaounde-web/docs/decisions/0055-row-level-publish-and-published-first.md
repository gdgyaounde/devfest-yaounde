# 0055 — Publish/hide from the row, and published work first

Date: 2026-09-14
Status: Accepted

## Context

Changing whether a shop product or a ticket tier was visible meant opening
its editor, finding the toggle among a dozen other fields, saving, and
closing — four interactions and a full form round-trip to flip one boolean.
The DP wall had already solved this in Phase 19 with an in-place toggle, and
speakers/team had an in-row toggle with no busy feedback at all.

Two listings needed it (Shop, Tickets), and two already had a weaker version
of it. That is the shape of a thing that belongs in the shared shell, not
copied into four views.

## Decision

**One toggle implementation, in `EntityCrud`.**

`rowToggle` already existed; it now also carries the DP wall's feedback
contract, so every listing that opts in behaves identically:

- **Optimistic.** The row flips immediately. A toggle that does nothing for a
  second reads as a toggle that missed, and the reaction to that is to press
  it again — which would queue a second write undoing the first.
- **Shimmer while in flight**, reusing `.admin-shimmer` from Phase 19 —
  the same veil on the same kind of wait, so it means the same thing in both
  places. It is `aria-hidden`; `aria-pressed` and `aria-busy` on the button
  carry the state for anyone not looking at it.
- **Revert + toast on failure.** A row silently disagreeing with the database
  is worse than one that never flipped.
- **Per-row, not global.** Only the row being toggled is disabled, so an
  unrelated save cannot make the whole list feel frozen.

It still routes through the same whole-array PUT, concurrency check and audit
entry as every other save. A view flipping a boolean and PUTting on its own
would be a second, quieter write path with none of that.

**Published-first ordering** is the new `sections` prop: two groups, the "on"
one first, each under a quiet mono label with a count. Published work is what
an organiser came to find; hidden rows are the exception and belong after it,
not interleaved by insertion order.

- Two `<section>`s with real `<h3>`s, not separator `<li>`s — a heading that
  is a sibling of the items it introduces is one assistive tech can skip to,
  and an `<li>` pretending to be a divider is an item that is not one.
- **Suppressed when `reorderable`.** The arrows swap rows by array index; in
  a regrouped list "move up" would no longer mean the row above it on screen.
  Offering both would make one of them lie.
- The row itself is extracted to `renderItem` so the flat and grouped lists
  render byte-identical rows. The split is about order and a label, and must
  not become a second row implementation that drifts.

## Applied to

| Listing         | Toggle reads          | Sections           |
| --------------- | --------------------- | ------------------ |
| Shop            | `published !== false` | Published / Hidden |
| Tickets (tiers) | `onSale`              | On sale / Off sale |

Speakers and Team keep their existing toggle and gain the shimmer and the
optimistic flip for free. They are **not** sectioned: Team is `reorderable`,
and grouping Speakers was not asked for.

## Consequences

- Hiding a product does **not** detach it from any tier that bundles it
  (ADR 0054) — the tier keeps the reference and the public preview skips it
  while it is hidden. The toast says so, because the two are easy to conflate.
- `onSale: false` on a tier still resolves for tickets already sold on it.
  Off sale means "not offered", never "gone".
- Verified in a browser against both listings: correct grouping and counts
  (`Published (3)` / `Hidden (1)`, `On sale (2)` / `Off sale (1)`), correct
  labels and `aria-pressed` per row, faded off-rows, no console errors.
