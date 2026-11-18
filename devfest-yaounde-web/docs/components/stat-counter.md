# StatCounter

`src/components/ui/StatCounter.tsx`

One home page figure: a big number that rolls in with the shared
[`Odometer`](odometer.md) when it scrolls into view, and — if it has an image —
a hover zone that turns the custom cursor into that picture (ADR 0057, sizing
and tilt reworked in ADR 0059).

## Props

| Prop        | Type     | Default                                                                                              |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `value`     | `number` | required — whole, non-negative                                                                       |
| `label`     | `string` | required — e.g. `"developers"`                                                                       |
| `suffix`    | `string` | `""` — e.g. `"+"` for "500+"                                                                         |
| `imageUrl`  | `string` | — optional picture; enables the cursor reveal                                                        |
| `index`     | `number` | required — position among the section's figures; the only input the alternating tilt is derived from |
| `className` | `string` | —                                                                                                    |

## Motion

- **Entrance:** paints `0`, then sets the real value once ~40% of it is on
  screen (`IntersectionObserver`). Each digit column makes one extra full
  turn and they land left to right (`revolutions={1}`, `staggerMs={90}`,
  `durationMs={1100}` — DESIGN.md §6.2 macro tier).
- **Reduced motion:** the final value from the start, no transition.
- **Screen readers** always get the real figure (`srText`); the rolling digits
  are `aria-hidden`, and the odometer is not a live region here.
- **Number size:** `text-[clamp(3.5rem,9vw,7.5rem)]` — a component-scoped
  size, not a shared type-scale token (see ADR 0059 for why), tuned so a
  phone no longer pins at the same 44px `text-display-hero`'s own floor gave
  it.

## The image

| Visitor                                      | What they get                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Mouse/trackpad, motion allowed               | Hover zone → cursor becomes the image card, trailing, bobbing gently once revealed |
| Touch, no hover, or `prefers-reduced-motion` | The image shown inline above the number, always visible                            |
| Figure without an image                      | Just the number                                                                    |

The inline image is hidden by CSS (`.stat-inline-image`) under exactly the
media query `CustomCursor` runs under, so one of the two is always there and
never both. The zone is padded past the glyphs (24px sideways, 16px
vertically) with a matching negative margin, so it does not move the layout.

**Sizing:** the cursor card is 320×200 and the inline fallback 144×96 —
both closer to an actual landscape photo's shape than the original ~4:3
boxes, so `object-fit: cover` (kept, not swapped for `contain` — see ADR 0059) has far less to crop off the sides.

**Tilt:** derived from `index` — `index % 2 === 0 ? -5 : 5` — so figures in a
row alternate which way they lean rather than all matching. Passed to
`CustomCursor` as `data-cursor-tilt` alongside `data-cursor-image`, and
applied to the inline fallback directly. See `docs/guides/custom-cursor.md`
for how the cursor reads it and why the bob needed its own nested element.

## Usage

```tsx
<StatCounter
  value={500}
  suffix="+"
  label="developers"
  imageUrl={url}
  index={0}
/>
```
