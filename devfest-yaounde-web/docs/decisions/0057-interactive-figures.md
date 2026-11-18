# 0057 — Figures that roll in, and a cursor that becomes a picture

Date: 2026-09-15
Status: Accepted

## Context

The home page's stats interstitial ("500+ developers…") was three hardcoded
numbers counting up from 0 with a `requestAnimationFrame` loop. Phase 21 asked
for three things, each with an explicit "reuse, don't rebuild" constraint:
make the figures editable, replace the count-up with **the** odometer from the
ticket counter, and let hovering a number turn the cursor into an image using
**the** custom cursor's trailing mechanics.

## Decisions

### Figures are a collection with an image

`stats` already existed in the editorial store (ADR 0031) with no admin
screen. It now has one — **Content → Figures**, on `EntityCrud`, so it gets the
concurrency-checked save, audit entry and typed-id delete like every list —
plus an optional `imageUrl` through the shared photo endpoint (type/size
validated, re-encoded server-side). Reorderable: order is left to right.

`value` is now `int().min(0).max(999_999_999)`: the odometer has one column per
digit and no sign or decimal point, so anything else could not be drawn.
Tightening it cannot invalidate stored data — the live project has no `stats`
row yet (checked read-only); the three figures are still the repo seed, and
the first dashboard save writes the row. No figures → no section.

### One odometer, extracted — not a second one

`Odometer` was a private function inside `CapacityCounter`. It moved to
`src/components/ui/Odometer.tsx` and gained options whose **defaults are the
ticket counter's exact behaviour**: `className`, `live`, `srText`, `durationMs`,
`revolutions`, `staggerMs`. `CapacityCounter` now imports it. The digit strip
exists in exactly one file.

For the stats, a figure paints 0 and takes its real value once 40% of it is on
screen. `revolutions={1}` makes each column spin one full turn on the way, and
`staggerMs` lands them left to right: without it, "0 → 500" moves one column
and leaves two zeros sitting still, which does not read as a counter at all.

- **Reduced motion:** the final value from the first client render and no
  transition — verified to be final _before_ the section is scrolled to.
- **Screen readers:** always the real figure (`srText`), never "0"; not a live
  region, since rolling in on scroll is not a change worth announcing.
- **No JS:** shows zeros, as the count-up it replaced did; the accessible text
  and the page text for crawlers carry the real figure.

### The cursor image is a state of the existing cursor

The brief allowed "replace or take over from" the custom cursor. Building a
second pointer-follower would have meant a second rAF loop and a second set of
touch/motion gates to keep in step. Instead `CustomCursor` gained an **image
state**: any element with `data-cursor-image="<url>"` is a zone, and inside it
the dot and arrow fade out while a picture card takes over.

- Same layer, same loop, same live gates — so it **cannot** run on touch or
  under reduced motion, by construction rather than by a check someone has to
  remember.
- A second eased point, deliberately lazier than the arrow (0.11 vs 0.18).
- Reveal: clip opening from the centre + a slightly bouncy scale. Dismiss: the
  same transitions reversed, over the same picture (src kept on leave).
- Target clamped so the card stays fully on screen.

**The zone** wraps the number, padded 24px sideways and 16px vertically past
the glyphs with a cancelling negative margin — a deliberate target bigger than
the ink, without moving the layout.

**The fallback** for everyone the cursor cannot reach is the image shown inline
above the number. It is hidden by CSS under _exactly_ the cursor's media query
(`(hover: hover) and (pointer: fine) and (prefers-reduced-motion:
no-preference)`), so the choice is made before hydration and one of the two is
always present. As a side effect the hidden inline image preloads the picture,
so the cursor card never reveals an empty box.

## Verified

In headless Chrome with a real fine/hover pointer (`--blink-settings`; default
headless reports neither, which doubled as the no-hover case):

| Check                                             | Result                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Before scroll                                     | digits at 0, accessible text "500+"                                                                    |
| Scrolled in                                       | caught **mid-roll** (−548px), settled at 5/0/0 after one turn each                                     |
| Zone vs glyphs                                    | zone 24px wider each side, 16px taller                                                                 |
| Enter via padding, 14px left of the first digit   | image state, reveal mid-transition, then fully open                                                    |
| Trailing after a fast move                        | card 149 → 105 → 83 → 58 → 41 → 33px behind over 240ms                                                 |
| Leave                                             | state back to default, dismiss runs over the kept picture, arrow returns                               |
| Figure without image                              | no zone, no inline image                                                                               |
| Ticket counter after extraction                   | shows 312, column 0.6em (was 0.62em)                                                                   |
| Desktop / reduced motion / no-hover / phone 390px | cursor on·off·off·off; inline image hidden·shown·shown·shown; roll 1.1s·none·1.1s·1.1s                 |
| Real home page, fr + en                           | 500+ / 40+ / 1 with correct labels, no zones yet, cursor still turns interactive over links, no errors |

## Consequences

- **The live figures have no images yet**, so the hover reveal does nothing on
  the real site until an organiser adds one per figure. No placeholder images
  were attached: a reveal showing a placeholder card would be worse than none.
- The figures are still the example numbers from `PAGES.md`
  (500+/40+/1) and need confirming.
- `data-cursor-image` is now a site-wide primitive. Any future use must pair
  it with a visible fallback for touch and reduced motion — noted in the
  design-system skill and the cursor guide.
