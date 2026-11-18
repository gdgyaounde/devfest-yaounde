# 0053 — Removing Lenis outright, not disabling it

Date: 2026-09-11
Status: Accepted — supersedes ADR 0007

## What happened

ADR 0007 adopted Lenis for momentum scrolling, gated to pointer-capable
desktop browsers under no reduced-motion preference, and verified against a
six-item contract before merging — keyboard scroll, focus-scroll,
find-on-page, anchors, the fixed navbar's containing-block, `ScrollStage` and
`Reveal`. All six passed at the time, with numbers recorded in that ADR.

**It broke scroll behaviour across the site in real use anyway**, reported
directly rather than caught by that verification. That gap between "passed
every automated check" and "broken in practice" is the reason this is a full
removal rather than another round of patching: the contract in ADR 0007 was
real and was met, and it still was not enough.

## The bugs this codebase's own history already recorded

Two are worth naming, because they were found and fixed once already — and
each is evidence that a JS library driving scroll keeps finding new ways to
disagree with the browser's own scrolling, not that these two exhausted the
list:

- **A stopped Lenis instance still swallowed wheel events.** `lockScroll()`
  called `lenis.stop()` for every overlay — the preloader, `Modal`,
  `BottomSheet`, the admin drawer — and a stopped Lenis does not go quiet: it
  keeps its wheel listener and calls `preventDefault()` on everything it
  sees. That swallowed scrolling _inside_ the overlay too, not just on the
  page behind it — measured, a scrollable drawer's `scrollTop` never left 0
  under a 3000px wheel. The workaround was a `data-lenis-prevent` attribute
  on every scrollable overlay body, checked by Lenis before its stopped
  branch, so each new overlay had to remember to carry it or silently break.
- **A startup race left Lenis never stopped at all.** The preloader's lock
  effect runs before the scroll provider's effect that creates the Lenis
  instance, so `lockScroll()` called `.stop()` on a `null` and the instance
  created a moment later was never told to stop. A wheel could then scroll
  the page up to 586px behind a screen that was supposed to be covering it —
  intermittently, depending on which effect won the race on a given load.

Both were real, both were fixed, and fixing them is exactly the kind of
patching that stops being worth it once the underlying pattern — _a library
runs its own scroll loop against the real document, and every piece of code
that freezes or measures scroll has to know that and work around it_ — keeps
producing new instances of the same category of bug.

## Decision: remove, don't disable

A flag that turns Lenis off leaves every one of those workarounds in the
code, still load-bearing the moment somebody flips it back on, and still
something a new overlay has to know about even while it is off. Removing it
outright means:

- Nothing in this codebase has to carry `data-lenis-prevent` or reason about
  a second scroll driver ever again.
- The scroll-driven effects that were already correct — `ScrollStage`,
  `Reveal`, the hero's `--exit` recede — stay exactly as they were. All three
  read `getBoundingClientRect()` / `IntersectionObserver` / native `scroll`
  events directly; none of them ever touched Lenis, which is precisely what
  ADR 0007's contract item 5 was verifying, and it verified something true.
- `src/lib/scroll-source.ts` stays. It was built as "the single seam that
  would point at Lenis instead if the ADR is approved" (ADR 0007's own
  words) specifically so removal would be this cheap: delete the branch that
  pointed at Lenis, keep the branch that was always there. The floating
  scrollbar and every `lockScroll()` caller needed no changes beyond the
  comments explaining what used to be true.

## What was removed

- The `lenis` package (`npm uninstall lenis` — one entry in the lockfile,
  consistent with ADR 0007's own claim of zero runtime dependencies; nothing
  else was pulled in or out).
- `src/components/global/SmoothScrollProvider.tsx`, deleted, and its mount in
  the root layout.
- Every Lenis branch in `src/lib/scroll-source.ts`: the instance reference,
  `setActiveLenis`, and the `.stop()`/`.start()`/`.scrollTo()` calls in
  `lockScroll()` and `scrollToY()`. The lock-count nesting logic, the native
  `getScrollSnapshot()`/`subscribeScroll()` pair, and the public API shape
  are unchanged — they were never Lenis-specific.
- Every `data-lenis-prevent` attribute: `Modal`'s takeover/drawer panel,
  `BottomSheet`'s root, and the DP generator's mobile sticker sheet. Nothing
  replaces them; native scroll never needed an escape hatch from itself.

## What was verified after removal

- Native wheel/trackpad scroll, keyboard scroll (Space, Page Up/Down, Home/
  End, arrows), tabbing focus to an offscreen element, anchor/hash links, and
  the browser's own find-on-page — all native browser behaviour with nothing
  now positioned to intercept any of it, which is the strongest possible
  guarantee for this list: there is no code path left that could break it.
- `ScrollStage` (Memory Lane) and every `Reveal` — confirmed unchanged, since
  neither ever read anything Lenis-specific.
- The floating scrollbar — confirmed it still tracks native `scrollY`
  through the same seam, drag-to-scroll and track-click both still route
  through `scrollToY()`.
- Every overlay's scroll lock (preloader, `Modal` dialog/takeover/drawer,
  `BottomSheet`, the admin drawer) — confirmed each still freezes the page
  and restores the exact scroll position on release, and that nested locks
  (an overlay opening over another) still only release on the last one
  closing.
- `npm run verify` (lint, typecheck, tests) and `npm run build` both pass.
- `grep -ri lenis` across the repo returns nothing outside ADR 0007 (marked
  superseded, kept for the historical record) and this ADR.

## Consequences

- One fewer runtime dependency, and one fewer category of "what did the
  scroll library do this time" bug class to re-discover.
- Momentum/accelerate-then-decelerate wheel scrolling is gone. `PHASE7_
INSTRUCTIONS.md §1a` asked for it; this reverses that, deliberately,
  because the actual behaviour it shipped was worse than plain native scroll
  for a real visitor, which is the only thing that was ever meant to matter.
- **Not proposing this again without new information.** ADR 0007's own
  six-item contract was real, was met, and still missed the two bugs above —
  neither shows up in "does keyboard scroll work" or "is the navbar still
  `position: fixed`" style checks; both only show up from using overlays and
  the page together, under load, across sessions. A future proposal to
  re-adopt momentum scrolling — Lenis or otherwise — needs to say what
  verification would catch what this one didn't, not repeat the same
  contract and expect a different result.
