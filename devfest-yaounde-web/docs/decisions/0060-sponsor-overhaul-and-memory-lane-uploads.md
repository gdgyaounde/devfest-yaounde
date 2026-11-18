# 0060 — Sponsors: the alpha bug, a cursor popup, tier rename, placeholder stickers; Memory Lane gets an admin screen

Date: 2026-09-16
Status: Accepted (PHASE22 §A)

## 1. The transparent-logo bug, found live in production

`normalisePhoto()` — the general photo pipeline behind speakers, team,
sponsors, products, quotes and stats — unconditionally re-encoded every
upload as JPEG. JPEG has no alpha channel. Verified directly, not assumed:
feeding sharp a PNG with a genuinely transparent region (constructed so the
region is really transparent, not merely "has an alpha channel that happens
to read 255 everywhere") and encoding it as JPEG returns **solid black**,
`(0,0,0)`, at every formerly-transparent pixel, sampled back from the raw
output.

**This was not a hypothetical.** The live sponsors collection holds exactly
one real sponsor — Google, tier `platinum` — and its logo, fetched and
inspected read-only before writing any code, is the Google wordmark on a
flat black rectangle. The multicolour "G" is unmistakable; so is the black
box behind it that should be transparent.

### The fix

`normalisePhoto` now reads the source's own `meta.hasAlpha` and only
changes format for images that actually use it: **WebP, `alphaQuality: 100`**
(verified: alpha samples back as exactly `0`, not merely low) for anything
with real transparency — the same treatment `normaliseBackdrop` already
gives the hero image, for the identical reason. Everything else keeps
encoding as JPEG, unchanged, because there is nothing an alpha channel would
have preserved there and JPEG is smaller at the same visual quality.

Both callers (`content/[id]/photo`, the by-entry route every collection's
admin form uses; `uploads/image`, the staged multi-file picker for swag and
product galleries) now store and serve the result under the extension and
content-type the chosen format implies (`storagePath`/`publicPhotoUrl` take
a `format` parameter; `PHOTO_CONTENT_TYPE` maps format → header). A re-upload
that changes format from a prior one (an admin replacing a plain photo with
a transparent one) triggers a best-effort cleanup of the stale file at the
old extension, so a by-entry record never accumulates an orphaned blob under
the path it no longer uses.

**Not fixed by this change:** the live Google logo, whose transparency was
already discarded by the OLD pipeline before this shipped — there is no
alpha channel left in that stored JPEG to recover. Re-uploading it after
this deploys will fix it; the admin sponsors screen now says so.

**Verified:** a new test constructs a real transparent-region PNG (an opaque
block composited onto a fully-transparent base, not a transparent layer
composited onto an opaque one — an earlier draft of this same test
accidentally built the second, which stayed fully opaque throughout and
would have passed either way), runs it through `normalisePhoto`, and samples
the raw WebP output back: alpha `0` in the transparent region, alpha `255`
in the opaque one, format `webp`. A second test confirms an ordinary opaque
photo still comes back as `jpeg`. Not verified: the live HTTP route through
Supabase Storage and its CDN — the fix was proven at the exact `sharp` layer
where the bug lived, without writing to the production bucket to do it.

## 2. Sponsor cards: a cursor popup, and the wall's spotlight

Both PHASE22 asks for reused mechanics rather than new ones, applied to a
new subject:

- **The cursor popup** (§A2) is a new _state_ of the existing
  `CustomCursor`, not a second follower. `[data-cursor-card="<name>"]` marks
  a hover zone (paired with `data-cursor-card-body` for an optional blurb,
  `data-cursor-tilt` for a per-zone lean) — parallel to, and deliberately
  independent from, the image-reveal state ADR 0057/0059 already built: own
  eased point, own CSS vars, own DOM. The two are never shown at once, but
  keeping them apart means the sponsor card could be built, or changed,
  without re-verifying the already-shipped figure reveal at all.
  - Same three-layer construction as the image card (position+tilt / bob /
    reveal), for the same documented reason: an animated `transform` fully
    replaces any other `transform` declared on the same element while it
    plays, so the bob cannot share an element with the position or the
    reveal scale.
  - **Fallback**: `.sponsor-inline-card`, hidden under exactly the media
    query `CustomCursor` runs under — the same pattern `.stat-inline-image`
    established. Touch and reduced-motion visitors get the name (and blurb,
    if set) as plain text under the logo; nothing is hover-only.
  - **Click is independent of the popup.** The `<a>` still opens
    `websiteUrl` in a new tab regardless of whether the popup ever showed.
- **The spotlight+dim** (§A3) reuses `.wall-tile`/`.is-spotlit`/`.is-dimmed`
  from the Community Wall verbatim — same classes, same transition, same
  `prefers-reduced-motion` override. The hover state that drives it had to
  move into a new client component (`SponsorRow.tsx`): `SponsorStrip.tsx` is
  `async` and reads translations server-side, and hover state needs a client
  boundary. Split exactly the way `DpWall`/`WallTile` already are, for the
  same reason — and for the same bug the wall already found and documented:
  **keying the hovered slot by the rendered SLOT, not the sponsor id**,
  because the marquee shows every sponsor twice (the seamless-loop
  duplicate) and an id-keyed hover would spotlight both copies of the same
  logo at once. Verified directly: hovering the first copy of a duplicated
  sponsor in a 7-sponsor marquee spotlit exactly one tile, not two.

## 3. Sponsor tiers renamed to match the ticket tiers

Ascending Haikyu/Sonnet/Opus/Fable/Mythos, replacing Platinum/Gold/Silver,
with Community and Partner kept as the two non-monetary options (§A4).

**Migration `0023` renames only `platinum → mythos`.** The live data (read
before writing the migration) holds exactly one sponsor on that tier —
top-to-top is the only part of a 3-tier-to-5-tier rename that requires no
guessing. `gold`/`silver` have zero rows to migrate today, and compressing
three old paid tiers into five new ones has no single correct answer (does
`gold` become Sonnet? Opus? Fable?) — PHASE22 says to ask a human rather than
invent one, so the migration does not. It actively **raises** if it ever
finds a `gold`/`silver` row on the database it runs against, naming the
sponsors affected, rather than silently leaving them on a retired tier name
the schema no longer accepts.

**A related bug, found while building the badge:** a sponsor record can
legitimately hold a tier value the CURRENT code no longer recognises — the
live Google record does, right now, because the migration has not run
against production yet. `sponsor.tier ?? "community"` only falls back when
the field is _absent_; an unrecognised _string_ (`"platinum"`) sailed past
that check into `TIER_ACCENT["platinum"]`, which is `undefined` — verified
live: the badge rendered with `background-color: rgba(0,0,0,0)`, invisible.
Fixed with a `knownTier()` guard that falls back on ANY value not in the new
enum, so a badge is never invisible whether or not the migration has run.

## 4. Tier stickers — explicitly placeholder

A small corner badge per sponsor logo (§A5), color-coded by tier from the
design system's four fixed literal accents (never `--color-primary`, which
follows the swappable theme — a badge tied to the live theme colour could
collide with whichever OTHER tier happens to map to that same colour once
the theme changes). Five paid tiers get five distinct trues (Haikyu neutral
offwhite, Sonnet blue, Opus green, Fable red, Mythos yellow); Community and
Partner share black02 and are told apart by icon instead, since the palette
only has four non-neutral accents to spend on seven tiers.

**Placement is seeded by the sponsor's own id**, not `Math.random()` — this
file renders once on the server for the static prerender and once on the
client for hydration (it is a client COMPONENT, even though it is not
re-executed after that), and a value that could differ between those two
passes is a hydration mismatch waiting to happen. A `title` attribute
("Placeholder tier badge — real sticker art pending") flags every instance;
this record and a note in the admin/design docs are the second flag PHASE22
asks for.

## 5. "Become a sponsor," sized like a seat

Moved out of the header row's pill-banner and into the seats row itself
(§A6), styled to `EmptySeat`'s exact box (`h-11`/`sm:h-14`,
`min-w-24`/`sm:min-w-32`, `rounded-md`) rather than a differently-sized
CTA — solid border and a filled background are the one deliberate
difference from a real empty seat, since this one is clickable and a real
design should say so. It sits OUTSIDE the scrolling marquee track even while
sponsors are scrolling, for the same reason the sponsor cards themselves
must never duplicate as a live hover/tab target: the track duplicates its
whole contents for a seamless loop, and a "become a sponsor" link must not
render, or be reachable by keyboard, twice.

## 6. Memory Lane gets an admin screen

The `past-editions` collection, its schema, and its photo-upload wiring all
already existed (ADR 0031/0032) — what was missing was anywhere in the
dashboard to use them, so the section only ever showed the four seed
placeholders (§A7). `AdminMemoryLane` is the first real screen for it: photo,
alt text (both languages), optional year, reorderable — on `EntityCrud`, so
it inherits the whole-array save, the concurrency check, and the typed-id
delete confirmation every other list has.

**The photo frame reuses `PersonSlider.tsx`'s polaroid treatment** — same
thick white border, black outline, offset shadow, `--polaroid-tilt` custom
property — rather than a second print-style component built to look
similar. `.polaroid`'s base sizing is height-driven (`height: 72%` of a
parent with a definite height, built for the cinema slide's row); Memory
Lane's grid cell has no such definite height, so `.memory-polaroid`
overrides it to width-driven instead. Its own independent tilt is zeroed:
Memory Lane already has a per-photo resting tilt on the OUTER
`.stage-photo` wrapper, driven by the section's own scroll-in/out
choreography (`--stage-rot`), and leaving `.polaroid`'s default rotation
active too would have added a flat, unvaried extra lean on every photo
rather than varying anything.

**Empty state** matches the sponsor strip's own dashed-border, quiet-caption
language rather than a bespoke "no photos" treatment — deliberately, so the
two empty states read as one visual idiom across the site rather than two.
`getPastEditions()` returning nothing is now a real, reachable state: an
organiser can clear the seed placeholders from the new admin screen before
real photos are ready.

## Verified

- The alpha fix: two new unit tests (transparent-region PNG → WebP with
  alpha 0 preserved; opaque photo → unchanged JPEG), both passing against
  the real `normalisePhoto` code path.
- The sponsor popup and spotlight: checked against the live single sponsor
  (confirms the fallback tier badge, the popup's title/body swap, the
  spotlight class) AND against a 7-sponsor harness covering three tiers'
  badge colours, the spotlight/dim state across all cards simultaneously, a
  long blurb correctly clamped to two lines in the popup, and the
  marquee-duplicate spotlight-avoidance case specifically.
- Touch and `prefers-reduced-motion`: the sponsor inline fallback confirmed
  visible with the cursor confirmed not running, in both cases.
- Memory Lane: the real 4-photo seed screenshotted showing the polaroid
  frame with alternating tilt intact; the empty state screenshotted
  separately and confirmed to match the sponsor empty-seat visual language.
- `npm run verify` (188 tests, lint, typecheck) and `npm run build` pass.
  `grep -ri gradient` stays clean; no new dependency was added.
- Migration `0023` dry-run in JS against the live sponsors payload: zero
  ambiguous (`gold`/`silver`) rows, the migrated payload validates against
  the live Zod schema. The SQL itself was not executed — there is no
  Postgres or Docker in the authoring sandbox and supabase-js cannot run
  arbitrary SQL — so its rules are proven, the statements expressing them
  are reviewed, not run.

## Consequences

- The live Google sponsor logo needs re-uploading to actually show its
  transparency; the code fix alone cannot repair bytes already flattened by
  the old pipeline. Flagged in the admin sponsors screen itself.
- Migration `0023` must run before an admin can save the sponsors
  collection again with the OLD tier names still present — the new schema's
  enum no longer accepts `platinum`/`gold`/`silver`, so an unmigrated record
  would fail validation on its next save (not before; reads are unaffected).

## Addendum — three follow-up fixes, same day

Feedback on the first pass, applied before Part A shipped further:

- **CTA moved to the end of the row.** `SponsorCtaSeat` now renders AFTER
  `SponsorRow`, not before it — it reads as the next seat in line rather
  than a banner ahead of the logos. Still outside the scrolling track, for
  the reason above.
- **Real tier stickers, not the letter/icon placeholder.** `TierBadgeContent`
  in `SponsorRow.tsx` now dispatches to one hand-drawn mark per tier (a seed
  for Haikyu, a note for Sonnet, a star for Opus, an open book for Fable, a
  flame for Mythos, a small connected-node cluster for Community, two linked
  rings for Partner) — each its own function in `SponsorRow.tsx`, kept
  structurally apart from `src/lib/dp/stickers.ts`'s shared sheet on
  purpose: that sheet feeds the DP generator's picker and the hero/
  testimonial random scatters, and a tier's identity mark must never turn up
  as a decorative pick somewhere else, nor let a scatter sticker leak in
  here as a tier mark. `TIER_ACCENT` (the fixed literal background colours)
  is unchanged.
- **Memory Lane's empty state redrawn as dashed OUTLINE frames**, plural —
  matching `EmptySeat`'s idiom of an open slot being an empty shape, not a
  single "coming soon" message box and not a fabricated photo. The four
  old placeholder SVGs (flat colour blocks standing in as "photos") are
  gone; `past-editions.json`'s seed is now `[]`, so the real site is
  honestly in the "nothing uploaded yet" state until real photos are added
  from Content → Memory Lane.
