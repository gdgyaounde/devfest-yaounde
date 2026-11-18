# 0056 — An editable gallery link, testimonials in the store, and stickers that stay out of the way

Date: 2026-09-14
Status: Accepted

## 1. Memory Lane's gallery link is a setting

"View the full gallery" links to last edition's album, which changes every
year — so it is a dashboard setting like the Bevy URL and the sponsor
prospectus, not a constant.

- Stored as `site_settings.memory_lane` (`{ galleryUrl }`), one jsonb column per
  settings group like `hero`/`cfs`/`legal`/`capacity` (migration 0022).
- `NULL` means the repo default, `PAST_GALLERY_URL` in `site-config.ts`, seeded
  with `https://photos.app.goo.gl/S4nVSxBmu73FjChW6`. The default _is_ the seed,
  so the migration writes nothing — the URL gets one home, not two.
- Empty hides the link rather than pointing it nowhere.
- `target="_blank" rel="noopener noreferrer"`, plus a screen-reader-only
  "(opens in a new tab)", since the arrow icon says it only to sighted users.

### The read had to change first

`loadSettings()` named every column in its `select`. Checked against the live
project: naming a column that does not exist fails the **whole** query
(`column site_settings.no_such_column does not exist`), and the error path
returns repo defaults for _everything_. So shipping code that reads
`memory_lane` before migration 0022 was applied would have silently reverted
the live announcement, hero backdrop, call for speakers and prospectus at once.

It now selects `*`. A column that is not there yet is simply absent from the
row, and only its own group falls back. This was verified the useful way: the
build against the live database — which does not have the column — renders
the gallery link from the repo default, with every other setting intact.

The dashboard only sends `memoryLane` when it changed, for the same reason on
the write side: sending it unconditionally would make every config save fail
on a database without the column, over a field nobody touched.

**Deploy note:** reading is safe in either order. Saving a changed gallery URL
needs migration 0022.

## 2. Testimonials are a real, editable collection

The `quotes` collection already existed in the store (ADR 0031) but had no
admin screen, no way to hide one, and no photo. It now has all three, under
**Community → Testimonials**, built on `EntityCrud` so it inherits the
whole-array save with concurrency check and audit, the typed-id delete
confirmation (0052), and the row toggle with shimmer (0055).

- **Reorderable**, because order is the rotation order — which is also why it
  has no Published/Hidden sections (0055: sectioning is suppressed where the
  reorder arrows would contradict what is on screen).
- `hidden?: boolean` with the same absent-means-visible convention as
  speakers; `getQuotes()` filters, `getAllQuotes()` does not.
- `avatarUrl?` via the shared photo endpoint (`PHOTO_FIELDS.quotes`), which
  already validates type and size and re-encodes server-side.
- No visible quotes → the section is not rendered. It used to index
  `quotes[0]` unconditionally, which an all-hidden list would have crashed.

**Migrated** the way every other collection was (ADR 0031): the three quotes
are the repo seed and are what the dashboard opens with; the first save
writes the database row. The live project has no `quotes` row yet, so
nothing in production was touched.

### The placeholder label, and the names

The visible copy read `"Placeholder quote — Hands down the best tech event…"`,
and one ended `"Real testimonial coming soon."` Those were scaffolding a
visitor was reading, so they are gone — **the words of each quote are exactly
as they were**, per the brief.

The three authors — "A. Kamga", "R. Talla", "S. Biya" — were invented along
with that copy. Leaving a real-sounding name on words that person never said
is worse than no name, so `author` may now be empty, and an empty author
renders a localized **"Community member" / "Membre de la communauté"**. The
role ("Attendee, past edition") is kept.

**Still true, and flagged rather than hidden:** the quotes themselves were
written as samples. The label is honest now; the content still needs
replacing with real, permitted testimonials before launch.

## 3. Stickers around the quotes

Flat decoration from the DP sticker set, drawn by the same
`drawStickerPreview` the hero uses — no second copy of any artwork.

**Which.** The brief suggested speech bubbles, hearts, thumbs-up. The set has
no heart or thumbs-up, and drawing them would start a second sticker source,
so the pick is from what exists: `bubble` (people saying things), `spark` (a
warm flourish) and `cup` (the coffee line one quote mentions). Text stickers
were rejected because at preview size they draw only their first word — "See
you there" would read as "See".

**Where.** Only in the section's top and bottom padding bands (96px on a phone,
160px from `lg`), which hold no copy at any breakpoint. Side margins were
rejected: at 1024px the text column leaves ~64px a side. Two stickers on a
phone, three from `sm`.

**Flat.** No blur, parallax or bob; a fixed tilt only. Nothing moves, so
reduced motion has nothing to switch off. `aria-hidden`, pointer-inert.

**Measured, not eyeballed.** In a browser at 360, 390, 768, 1024, 1280, 1440 and
1920px, in both locales, for each of the three quotes: no sticker box
intersects any copy or dot control, none is clipped, and the smallest
distance to a text _box_ is 20px (to glyphs it is larger — centred text sits
well inside its box). A first pass measured 10px at 768px; the bubble was
moved up and trimmed rather than argued about.
