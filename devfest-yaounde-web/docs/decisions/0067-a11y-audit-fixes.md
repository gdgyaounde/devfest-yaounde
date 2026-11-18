# 0067 — Accessibility audit fixes: `-ink` tokens, a lightened Red primary, and a skip link that actually moves focus

Date: 2026-09-16
Status: Accepted (PHASE22 §G)

## What

The final part of PHASE22 was a Lighthouse + axe-core accessibility and
performance audit of the site as it stands after the whole phase — see
[`docs/audits/a11y-performance-2026-09-16.md`](../audits/a11y-performance-2026-09-16.md)
for the full findings and verification. This record covers the design
decisions behind the fixes, which touch shared tokens and patterns
worth explaining once rather than re-litigating at each call site.

## `-ink` colour tokens, not a change to the base colours

`--color-blue`, `--color-success` (green), and `--color-danger` (red)
are all used two ways: as vivid fills/borders (where they only need
3:1 against an adjacent surface) and, in `Badge`/`StatusPill`/`Button`,
as TEXT on their own pastel (where WCAG AA wants 4.5:1). The raw
colours clear the first bar and fail the second — by a wide margin for
green/red (2.55:1 / 2.95:1), narrowly for blue (2.82:1).

Rather than darken `--color-blue`/`--color-green`/`--color-red`
themselves, three new tokens — `--color-blue-ink`,
`--color-success-ink`, `--color-danger-ink` — hold a darkened step of
each, used ONLY where the colour is rendered as text on its own
pastel. Darkening the base tokens directly was rejected: `--color-blue`
is also the Blue theme's `--color-primary` (darkening it would have
recoloured every button and accent under that theme to fix three
badges), and `--color-green`/`--color-red` are aliased directly as
`--color-success`/`--color-danger` and used as borders and icon fills
throughout the admin and public UI, where the original vividness is
correct and unaffected.

## The Red theme's `--color-primary`, specifically, is a shade lighter than raw `--color-red`

The 4-theme contrast sweep (axe-core, `localStorage["devfest-theme"]`
set before each load — the same mechanism `ThemeSwitcher` itself uses)
was the only method that could have caught this: `text-black02` on
`bg-primary` — DevFest's standard "primary button/badge/marquee" text
colour — clears 4.5:1 comfortably under Blue, Yellow, and Green, but
lands at 4.24:1 under Red, since raw Red (`#ea4335`) is simply the
darkest of the four primaries.

`:root[data-theme="red"]` now sets `--color-primary: #ec5245` — Red
lightened ~8%, chosen as the smallest lift that clears 4.5:1 (4.65:1)
rather than an arbitrary rounder number, and visually indistinguishable
from the original at a glance. `--color-red` itself, and
`--color-danger` which aliases it, are untouched: "sold out" and other
danger-badge text already pairs with `--color-danger-ink` (above), not
raw black text, so they were never at risk from this specific
combination.

## Skip-to-content needed `tabIndex={-1}` on the target, not just the link

The skip link (`src/app/[locale]/layout.tsx`) was already correctly
built — `sr-only` until focused, first in the tab order, pointing at
`#main-content`. What was missing was on the OTHER end: none of the 18
`<main id="main-content">` elements across the app were focusable, so
activating the link scrolled the browser to `<main>` (the native
fragment-navigation behaviour) without ever moving
`document.activeElement` there. A keyboard user's next Tab press would
silently resume from the top nav, exactly the sequence the link exists
to let them skip.

`tabIndex={-1}` on all 18 makes each one programmatically focusable —
reachable by the fragment jump — without adding it to the ordinary Tab
sequence (a `<main>` landmark has no reason to be a stop on its own
during normal forward tabbing). Verified directly, not assumed:
`document.activeElement.id === "main-content"` immediately after a
scripted `Enter` on the link, on a fresh production build.

## A sponsor blurb gets a fourth path, gated by the exact inverse of an existing rule

`CustomCursor`'s hover-card and `SponsorRow`'s inline paragraph are
documented as mutually-exclusive fallbacks, gated by the same media
query so "one of the two is always present and never both" (see that
component's own doc comment). That guarantee holds for VISUAL
reachability, but the hover-card is `aria-hidden` by design (it's
decorative; the logo is supposed to carry the real information) and
the inline paragraph is `display: none` — invisible to assistive tech,
not just sighted users — under `(hover: hover) and (pointer: fine) and
(prefers-reduced-motion: no-preference)`. That's precisely the media
state an ordinary desktop screen-reader user matches (a physical mouse
is present, even though it's never used to trigger `:hover`), so a
sponsor's blurb text was reachable by mouse-hover OR by touch, but
never by that combination.

Fix: a fourth, `sr-only` copy of the blurb, gated by the _inverse_
query — present in the accessibility tree exactly when the inline
paragraph is display:none (i.e., when the cursor-card is the active
reveal), and itself removed from the tree exactly when the inline
paragraph is visible and would otherwise say the same thing twice to a
touchscreen screen-reader user. Two CSS rules, deliberately mirror
images of each other, so between them every visitor gets the blurb
exactly once. `StatCounter`'s inline image needed no equivalent: its
`<img alt="">` is genuinely decorative (the stat's real label is
separate, always-visible text), so there was no unique information
behind it to begin with.

## Footer link-group titles are `<h2>`, not `<h3>`

Schedule, Shop, and Speakers each have only an `<h1>` in their own
content, so the shared `<footer>`'s three link-group titles — previously
`<h3>` — created a skipped level (`h1` → `h3`) the moment the page
reached them. Team and FAQs happened to already have a real `<h2>` and
never tripped this. Rather than invent a placeholder `<h2>` in each
thin page just to satisfy the linter, the footer's titles became
`<h2>` — a standalone navigation-group heading at the top level is a
completely standard pattern (GOV.UK's footer does the same), and
fixing it once at the shared component fixes every page, present and
future, rather than page-by-page. `CallForSpeakers`'s own heading —
used as a sibling slot to `SpeakerShowcase` (correctly `<h2>`) on Home,
and directly under Speakers' `<h1>` — was the same bug, not currently
visible in the crawled state (the lineup is populated, so it isn't
rendering today) but real the moment call-for-speakers is active
again; fixed to `<h2>` alongside it.

## Consequences

- Anyone adding a new place that renders `text-blue`/`text-success`/
  `text-danger` as TEXT on that colour's own pastel should reach for
  the `-ink` variant from the start. A repo-wide grep found no other
  such usage at the time of this audit.
- The muted-text opacity sweep (`text-black02/40` through `/60` →
  `/65`, 147 occurrences across 51 files, public and admin both) isn't
  a new pattern or token — it's the existing `--color-black02` opacity
  convention, corrected to the one value in that family that actually
  clears 4.5:1 on both `--color-offwhite` and every theme's
  `--color-pastel`. `hover:`/`placeholder:`/`focus:` variants were left
  as they were on purpose (see the audit doc for why).
- Performance scores from this pass are noted but not acted on further
  — see the audit doc's dedicated section on why the numbers moved
  between runs on this particular machine, and why that isn't grounds
  to conclude a regression without a clean-environment or CI
  measurement to back it.
