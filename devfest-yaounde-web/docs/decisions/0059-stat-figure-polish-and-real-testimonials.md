# 0059 — Bigger, uncropped stat figures with alternating tilt, and testimonials that sound like a person

Date: 2026-09-16
Status: Accepted — extends ADR 0057

## 1. The numbers were pinned at their floor on every phone

`StatCounter`'s digits used `text-display-hero` verbatim — `clamp(2.75rem, 8vw, 7.5rem)`. On anything narrower than ~550px, `8vw` is already below the 2.75rem (44px) floor, so every phone rendered the SAME 44px regardless of how much narrower it got past that point — which read as small on the actual reported device, and had no further room to shrink to explain it.

Rather than touch the shared `--text-display-hero` token (it also sizes the hero wordmark, and DESIGN.md doesn't define a "stat figure" size — this file's own header warns against adding font sizes that aren't there), the fix is scoped to the one component: `text-[clamp(3.5rem,9vw,7.5rem)]`. Same curve shape, floor raised 44px → 56px, preferred fraction nudged 8vw → 9vw so it also reads bigger through the middle of the range — and the SAME 7.5rem (120px) ceiling `text-display-hero` has, so a figure still never outweighs the actual hero it sits below.

## 2. The images were cropped because the frame was boxier than a landscape photo

The cursor card and its inline-fallback twin were both close to 4:3 (240×180 / 80×112). A genuinely landscape photo — the kind the admin form's own hint text asks for — is usually nearer 3:2 or 16:9, and `object-fit: cover` on a boxier frame than the source crops the sides to fill it.

`object-fit: contain` was considered and rejected: it would leave visible dead space inside the card on anything that doesn't match the box exactly, and this design system does not do letterboxing (DESIGN.md §2.6's flat-fill rule, in spirit if not letter). Instead, both frames widened toward the photo's own shape:

- Cursor card: 240×180 → **320×200** (4:3 → 8:5).
- Inline fallback: 80×112 → **144×96** (a near-square crop → a real landscape one).

Verified against real uploaded photos, not only synthetic test images: a 1080×606 (16:9) crowd shot and a 16:9 speaker shot, both admin-uploaded to the live stats before this change, now show almost their full frame in the reveal card instead of a tight crop.

## 3. Alternating tilt, and a bob once revealed

**Tilt.** Every card used the same fixed `-4deg` lean regardless of which figure it belonged to — three figures in a row all leaning identically reads as a template, not a considered placement. `StatCounter` now derives a tilt from its position (`index % 2 === 0 ? -5 : 5`) and writes it onto the hover zone as `data-cursor-tilt`; `CustomCursor` reads that once per zone-entry and sets `--image-tilt`, falling back to the original -4deg for any future zone that doesn't specify one. The inline fallback image gets the same alternating value, so the two presentations agree.

**The bob.** Once a card is revealed, it now bobs gently — `translate3d(0, -7px, 0)` over 3.6s, ease-in-out, only while `[data-state="image"]` is set, so a hidden card never spends a frame animating nothing.

This needed a **third nested layer**, not two. `.cursor-image` composes position (`--image-x/-y`) and the new static tilt (`--image-tilt`) in one non-animated `transform`. The bob is a `@keyframes` animation, and an animated `transform` fully replaces whatever else is declared for `transform` on that SAME element for as long as it plays — the identical failure mode `.hero-sticker`/`.hero-sticker-inner` was already split to avoid (see that component's own doc comment; confirmed there by reading a computed transform back and finding every sticker pinned at `matrix(1,0,0,1,0,0)`). So the bob lives on its own `.cursor-image-float`, nested inside the position+tilt wrapper and wrapping the `img` that still owns the reveal's clip+scale transition. Three transform sources, three elements, none of them able to erase another.

## 4. Testimonials rewritten for voice, not for facts

The brief asked for something that reads like an actual person's recollection — dry, a little self-aware, short — rather than the brochure-toned originals ("Hands down the best tech event...", "...genuinely makes you want to come back every year"). Rewritten in both locales as native rewrites, not literal translations, per the `devfest-brand-voice` skill's own rule on tone crossing languages:

| Before                                                               | After                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| "Hands down the best tech event I've been to in Yaoundé."            | "Came for the free t-shirt. Stayed because the talks were, annoyingly, actually good."           |
| "I found my co-founder in the coffee line."                          | "Found my co-founder in the coffee queue. Best business meeting I never scheduled."              |
| "A community that genuinely makes you want to come back every year." | "Rehearsed for a half-empty room. Got a packed one and still ran two minutes over — old habits." |

None of this changes their status: these are still **invented sample copy**, same as before this rewrite (`docs/guides/updating-content.md`'s "still placeholder" table already flags `quotes.json` for that, unchanged by this ADR) — the fix is to the voice, not a claim that these are now real testimonials.

## Verified

- Number size: 44px floor confirmed gone (mobile now measures 56px; desktop reaches the 120px ceiling sooner than before, matched to `text-display-hero`'s own cap).
- Tilt alternation confirmed on real zones (`-5deg`, `5deg`, `-5deg` across three figures) and confirmed switching correctly on hover between adjacent figures.
- The bob's computed `transform` sampled 8 times over ~3.6s produced 8 distinct values — genuinely animating, not stalled.
- Cropping fix checked against BOTH synthetic images at several ratios (16:9, 3:1, ~3:2) and, more importantly, the real photos already live in production (1080×606) — screenshotted showing near-full-frame photos in the reveal card, tilted in alternating directions.
- Inline mobile fallback re-checked at 390px: bigger images, alternating rotation, no console errors, cursor confirmed not running (as expected on a touch/no-hover device).
- Testimonials re-read back from the live build in both locales via the actual quote rotation UI, not just the source file.
- `npm run verify` (186 tests, lint, typecheck) and `npm run build` pass; no gradients introduced.
