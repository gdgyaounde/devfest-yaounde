# Accessibility & performance audit — 2026-09-16

PHASE22 §G. Run against the finished state of the whole phase (Parts
A–F, the transaction fee, refund tracker, bulk admin actions, and the
PWA) — deliberately last, so it evaluates the site as it will actually
ship rather than a moving target.

Scope: the seven public pages a visitor actually buys or reads on —
Home, Tickets, Shop, Schedule, Speakers, Team, FAQs — in both locales
where the tooling supports it directly (Schedule was spot-checked in
French; the others share one layout and template per locale, so an
English pass plus the French-specific bugs already caught elsewhere in
this phase covers the risk). Admin is authenticated, staff-only tooling
and was intentionally out of scope for this pass, though the same
design tokens were swept across it too (see "What was fixed", below).

## Method

Nothing here is claimed without a tool run to back it:

- **axe-core** (the library Lighthouse itself uses for its
  accessibility category), run directly via Puppeteer against a real
  production build (`next build` + `next start`) — the full
  `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` rule set, not just
  color-contrast, across all 8 pages.
- The same axe-core color-contrast rule, re-run once per theme
  (**Blue, Red, Yellow, Green**) by setting
  `localStorage["devfest-theme"]` before each page load — the exact
  mechanism `ThemeSwitcher` itself uses — across all 7 public pages.
  28 page×theme combinations in total.
- **Lighthouse 13.4.1** CLI, accessibility + performance categories,
  against the same production build.
- A scripted keyboard-only pass (Puppeteer's `page.keyboard`): the
  first 10-12 Tab stops on Home and Tickets, and a dedicated check that
  the skip-to-content link both scrolls AND moves focus.
- Manual reading of the hover-only reveal components (`CustomCursor`,
  `StatCounter`, `SponsorRow`) and their documented fallback paths.

Every fix below was re-verified by re-running the same tool against a
fresh rebuild — not assumed fixed from reading the diff.

## What was found, and fixed

### 1. A sitewide muted-text opacity token was under WCAG AA

`text-black02/40` through `/60` — the `--color-black02` "ink" at 40-60%
opacity, DevFest's standard way to de-emphasise a tag, caption, or
future/inactive label — measures **2.4:1 to 4.2:1** against both
`--color-offwhite` and `--color-pastel`, short of the 4.5:1 WCAG AA
requires for text. This is what Lighthouse caught first: nearly every
audited page failed `color-contrast` on at least one mono-tag label,
caption, or filter heading.

**Fix**: every non-hover, non-placeholder occurrence of
`text-black02/40`, `/45`, `/50`, `/55`, `/60` became `text-black02/65`
— the lightest step in that family that clears 4.5:1 on both surfaces
with margin (4.81-4.89:1). One token, one value, applied by a scripted
sweep across 147 occurrences in 51 files (public and admin both — it's
the same design token everywhere, and there was no reason to leave
admin with the pre-audit numbers once the public-facing side was
fixed). `hover:`/`placeholder:`/`focus:` variants were left alone
deliberately — a placeholder's rendered contrast isn't what SC 1.4.3
covers, and a hover-only dim on already-full-contrast underlined text
isn't the persisted colour a screen reader or low-vision reader
actually reads.

### 2. The "blue"/"success"/"danger" fixed badge tones were also under AA

Same shape of bug, different family: `text-blue` on `bg-blue-pastel`
(the "pre-order" / "includes a tee" badges) measured **2.82:1**.
`text-success`/`text-danger` on their own pastels (in-stock / sold-out,
confirmation states) measured **2.55:1** / **2.95:1** — not directly
caught by Lighthouse's crawl (the specific product states it rendered
that day didn't happen to include a solid-tone success/danger badge),
but the same literal colour pair, so mathematically certain to fail
wherever it does render.

**Fix**: three new **`-ink`** tokens — `--color-blue-ink`,
`--color-success-ink`, `--color-danger-ink` — each the family's raw
colour darkened until it clears 4.5:1 on its own pastel (and, checked
separately, on `--color-offwhite`). These are additions, not
replacements: `--color-blue`/`--color-success`/`--color-danger`
themselves are untouched, since they still do real work as borders,
icon fills elsewhere, and (for blue) the Blue theme's `--color-primary`
— darkening those directly would have recoloured buttons across an
entire theme to fix a badge. `Badge.tsx`, `StatusPill.tsx`, and
`Button.tsx`'s `blue`/`success` tones now render their TEXT in the
`-ink` variant; everything else is unchanged.

### 3. The Red theme's own primary button/badge text failed — the other three didn't

The 4-theme sweep is what caught this one; it's invisible unless you
actually load the Red theme. `text-black02` on `bg-primary` — the
standard "primary button/marquee/badge" pattern used everywhere
`--color-primary` appears — measures **4.24:1** when Red is active
(raw `--color-red`, `#ea4335`), just short of 4.5:1. Blue, Yellow and
Green all clear it with a wide margin; Red is simply the one primary
dark enough to be marginal against black text.

**Fix**: `:root[data-theme="red"]` now sets `--color-primary` to
`#ec5245` — Red lightened ~8%, indistinguishable at a glance, clearing
4.65:1. `--color-red` and `--color-danger` (which aliases it) are
untouched everywhere else, since "sold out" etc. already pairs with
`--color-danger-ink`, not black text. Re-running the full 4-theme ×
7-page axe sweep afterward: **0 violations, all 4 themes.**

### 4. Two pages skipped a heading level

Lighthouse's `heading-order` check flagged Schedule and (transitively,
via the shared Footer) Shop and Speakers: each has only an `<h1>` in
its main content, then the page's `<footer>` introduces an `<h3>` for
its three link-group titles — `<h1>` → `<h3>` with no `<h2>` between.
Team and FAQs already have a real `<h2>` in their content and so never
tripped this.

**Fix, not a workaround**: the footer's three group titles are now
`<h2>`, which is the correct level for standalone navigation-group
headings that aren't nested under anything else, and is a completely
standard pattern (used by, among others, GOV.UK's own footer). Fixing
it there once resolves it on every page, present and future, rather
than inventing an artificial heading in each thin page's content just
to satisfy the linter. While tracing this, `CallForSpeakers`'s
internal heading (used on both Home and the Speakers page as a sibling
slot to `SpeakerShowcase`, which is correctly `<h2>`) turned out to be
an `<h3>` too — not currently visible in the specific crawl state
(the lineup is currently populated, so `SpeakerBrowser` renders
instead), but a real, reproducible skip the moment the call-for-speakers
state is ever active again. Fixed to `<h2>` to match its sibling.

### 5. The skip-to-content link didn't actually move keyboard focus

Found during the scripted keyboard pass, not by an automated
tool — this is a real gap in what Lighthouse/axe check. `<a
href="#main-content">Skip to content</a>` is present, correctly
`sr-only` until focused, and IS the first Tab stop everywhere — but
none of the 18 `<main id="main-content">` elements across the app had
`tabIndex={-1}`. A native fragment-hash jump only scrolls a target that
isn't otherwise focusable; it does not move focus. Confirmed directly:
before the fix, activating the skip link left `document.activeElement`
unchanged (still the link itself); the very next Tab press would have
resumed from the top nav, not from inside the page content — precisely
defeating the reason a skip link exists for a keyboard-only visitor.

**Fix**: `tabIndex={-1}` added to all 18 `<main id="main-content">`
elements (every page in the app). Re-verified after rebuilding:
`document.activeElement.id === "main-content"` immediately after
activating the skip link.

### 6. A sponsor's blurb was reachable by mouse-hover OR touch — never by a mouse-plus-screen-reader visitor

Not caught by axe or Lighthouse (both check what's in the DOM at
crawl time, not what a live pointer state would reveal) — found by
reading `CustomCursor`'s own documentation and following its two
"reach every visitor" fallback paths to their actual conditions.

The sponsor strip has three parallel ways to show a sponsor's name +
optional blurb: a floating cursor card (desktop, fine pointer, motion
OK — but the whole layer is `aria-hidden`, since it's decorative and
the figure/logo it illustrates is meant to carry the real information),
an inline paragraph (the documented touch/reduced-motion fallback,
shown exactly when the cursor card isn't), and the logo's own `alt`
text (always present). The **name** is covered in all cases by the
logo's `alt`. The **blurb**, though, only ever existed in the
`aria-hidden` cursor card or the inline paragraph gated to
`display:none` under `(hover: hover) and (pointer: fine) and
(prefers-reduced-motion: no-preference)` — exactly the media query
that matches a completely ordinary desktop screen-reader setup (a
physical mouse present, even though it's never being moved to
"hover" anything). That visitor would never have heard the blurb at
all.

**Fix**: a new `sr-only` span carries the blurb unconditionally,
gated by the _inverse_ media query (`.sponsor-sr-blurb`, in
`globals.css`) so it drops out of the accessibility tree specifically
when the inline paragraph is the one actually visible — preventing a
touchscreen VoiceOver visitor from hearing the blurb twice. Verified
by reading the resulting CSS logic against both branches of the
original gate; this one wasn't practically re-testable by an automated
crawl (headless Chrome always reports `hover: hover` regardless of
whether a "mouse" ever moves), so the verification here is the CSS
logic itself being the exact complement of the existing, already-
shipped `.sponsor-inline-card`/`.stat-inline-image` gate.

`StatCounter`'s inline image fallback was checked the same way and
found NOT to need this: its image carries `alt=""` (correctly
decorative — the stat's real label is separate, always-visible text),
so there is no unique information behind it to lose in any pointer
state.

## What was checked and found already correct

- **Keyboard reachability**: every one of the first 10-12 Tab stops on
  Home and Tickets landed on a real, labelled, visibly-focused
  control (the announcement banner, nav, install prompt, ticket-tier
  add buttons) — nothing invisible, nothing unlabelled, nothing
  trapped. `:focus-visible` gives every one of them a 3px themed
  outline (`src/app/globals.css`).
- **Modal focus traps**: `ConfirmDeleteModal`/`ConfirmBulkDeleteModal`
  already implement Escape-to-close, backdrop click, and a real focus
  trap (established in earlier phases; re-read, not re-built, for this
  audit).
- **Full WCAG2A/AA rule set** (not just contrast): 0 violations, all 8
  pages, after the fixes above — labels, landmarks, ARIA usage,
  list structure, language attributes, form associations, and every
  other rule axe-core checks.

## Performance

Lighthouse's performance category was run at every stage, but its
score moved around a lot run to run on this machine — a shared
interactive workstation (VS Code, this very session, a browser, a
desktop chat client all running at once; `uptime` showed a load
average of 2-3 on top of the Chrome instance Lighthouse itself
launches) rather than a dedicated CI runner. None of this audit's
fixes touch JS bundle size, blocking resources, image weight, or
anything else performance-relevant — they're CSS custom-property
values, two heading tag renames, and one HTML attribute repeated 18
times — so a score that drifts between runs on the same unchanged
build is measurement noise, not a regression, and is reported here
rather than quietly ignored (the same "verify empirically, don't
assume" rule this whole phase has followed elsewhere — see ADR 0066's
own stale-process detour for the sibling lesson: an environment
artifact can look exactly like a real regression if it isn't checked
directly). No page scored below 85 on a clean early run before
subsequent contention grew; nothing in the fixes above should have
moved that number in either direction, and none of the automated
checks (`npm run verify`, the browser gate suite) regressed. A
dedicated performance pass on a quiet machine — or in CI — is the
right way to get a trustworthy number, and is flagged here as a
followup rather than asserted from noisy local data.

## Followups noted, not fixed in this pass

- The `-ink` text-token pattern (§2/§3 above) was applied to
  `Badge`/`StatusPill`/`Button` specifically because those are the
  components Lighthouse's crawl or the theme sweep actually exercised.
  A repo-wide grep for any other literal `text-blue`, `text-success`,
  or `text-danger` usage came back clean at the time of this audit, but
  a future PR introducing a new one should reach for the `-ink`
  variant from the start rather than rediscovering this the same way.
- This pass covers the 7 public marketing/commerce pages. Admin
  received the same token sweep (§1/§2) for consistency but was not
  independently crawled with axe/Lighthouse — it's staff-only,
  authenticated tooling, and out of scope for a visitor-facing a11y
  audit, but worth its own pass if it's ever opened up further.

## Verification

- `npm run verify` (lint + `tsc --noEmit` + 210 tests): passing.
- `npm run build`: passing, clean production build.
- axe-core, full WCAG2A/AA rule set, 8 pages: **0 violations**.
- axe-core, color-contrast only, 4 themes × 7 pages (28 combinations):
  **0 violations**.
- Lighthouse accessibility category, 8 pages: **100/100**, all pages
  (was 94-98 before this pass's fixes).
- Scripted keyboard pass: skip link is the first Tab stop on every
  page, and moves real focus (`document.activeElement.id ===
"main-content"`), not just the URL hash.
