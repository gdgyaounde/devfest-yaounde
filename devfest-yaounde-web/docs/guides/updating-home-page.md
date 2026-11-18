# Updating the Home Page

Everything visible on the home page is either translation copy (`messages/fr.json` / `messages/en.json`) or structured content data (`src/data/*.json`). You shouldn't need to touch component code (`src/components/home/`) just to swap in real content.

## What's placeholder right now — replace all of this before launch

| File                                      | Feeds                                                                                                                                                       | What to do                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/speakers.json`                  | Speaker Showcase preview + speaker modal                                                                                                                    | Replace the 6 fake entries (Jane Doe, Kwame Asante, etc.) with real speakers. `featured: true` controls who shows up in the Home preview carousel — the full roster lives on `/speakers` once that page is built (Phase 4).                                                                                      |
| `src/data/sponsors.json`                  | Hero sponsor logo marquee                                                                                                                                   | Replace the 5 fake companies (Acme Cloud, Globex Systems, etc.) with real sponsor names, logos, and website links.                                                                                                                                                                                               |
| `src/data/stats.json`                     | Stats interstitial — now edited in the dashboard, **Content → Figures** (number, label, optional image; order is left to right). This file is only the seed | Replace `500+ developers` / `40+ speakers` / `1 unforgettable weekend` with real figures once known — these were taken directly from `PAGES.md`'s own example text, not invented.                                                                                                                                |
| `src/data/quotes.json`                    | Rotating quotes interstitial                                                                                                                                | Replace the 3 fake testimonials with real community quotes (get permission to use people's names/quotes first).                                                                                                                                                                                                  |
| `src/data/past-editions.json`             | Hero photo collage **and** Memory Lane photo grid (same 4 files, reused in both places)                                                                     | Replace the 4 placeholder color-block SVGs with real past-edition photos. See "Real photos" below — this is the biggest visual jump once done.                                                                                                                                                                   |
| `src/data/faqs.json`                      | FAQ preview section                                                                                                                                         | Replace the 4 generic Q&As with real ones. The full `/faqs` page (Phase 4) will likely use a larger set — this file can grow into that, or get superseded by it.                                                                                                                                                 |
| `home.hero.*` (in both `messages/*.json`) | Hero                                                                                                                                                        | `dates` and `venue` currently say "Dates dropping soon" / "Yaoundé, Cameroon" — update once confirmed. The hero also carries `eyebrow`, `tagline` and the three CTA labels; these are written in a deliberately casual festival voice, so keep that register when editing (see the `devfest-brand-voice` skill). |

Every JSON file above has both an `fr` and `en` value for translatable fields — fill in both, not just one, before calling a content update "done" (per the bilingual rule).

## Real photos and `MorphedImageFrame`

`src/components/ui/MorphedImageFrame.tsx` (the blob-shaped photo frame) takes a plain image URL — swapping a placeholder SVG for a real JPG/PNG is just changing the `photoUrl` / `logoUrl` / `imageUrl` field in the relevant JSON file, no code change needed. Put real image files under `public/` (e.g. `public/speakers/jane-doe.jpg`) and reference them the same way the placeholders under `public/placeholders/` are referenced now.

## What's NOT placeholder — skipped or genuinely open

- **Tracks section** (`PAGES.md` §2.6) — not built at all. Tracks aren't confirmed for this year; inventing track names/icons wasn't an option. If tracks get confirmed, this is a new section to add, not a placeholder to fill in — ask a developer.
- **Schedule Overview preview** — the "Day 1 / Day 2" tabs and session titles in `src/components/home/ScheduleOverviewPreview.tsx` are hardcoded illustrative placeholders (not sourced from a data file), since no real schedule/session data exists yet. This is Phase 4 territory (`/schedule` page) — once real session data exists, this component should be rewired to source from it rather than edited by hand.
- **"See full lineup" / "See full schedule" / "More questions?" links** — these already point at `/speakers`, `/schedule`, `/faqs`, which exist as "coming soon" placeholder pages from the initial scaffold. They'll start showing real content once Phase 4 builds those pages out — no link changes needed here.

## Logo assets

The DevFest "><" mark lives in `public/logo/` (SVG plus the two bracket-half PNGs) and is duplicated at `src/app/icon.svg` for the browser-tab favicon. It renders through `src/components/brand/DevFestLogo.tsx`, which inlines the SVG so the two halves can animate independently.

**These are the Lagos chapter's copies of shared GDG/DevFest brand material.** If GDG Yaoundé has its own approved brand kit (or a chapter lockup with the city name), those should replace these — see `docs/decisions/0006-logo-assets.md`. Swapping is a drop-in: overwrite the files, and if the artwork's geometry differs, update the four `<path d="...">` values inside `DevFestLogo.tsx`. No other file changes.

## Component reference

If you do need a developer to change how a section looks (not just its content), each shared building block is documented under `docs/components/` — see that folder for `Button`, `Badge`, `SectionContainer`, `MorphedImageFrame`, `IconWrapper`, `StatCounter`, and `Modal`.

## Phase 7 changes worth knowing

**The RSVP-on-Bevy option is gone.** Getting a ticket is now the only path
into the event — see `docs/decisions/0008-retire-bevy-rsvp.md`. The separate
**"Join the Community"** link (footer + the community section) still points at
Bevy and is unaffected; that's community-joining, not event-RSVP.

**Hero date and venue** now live in a single compact "ticket stub" strip
rather than two stacked pills. Editing them is unchanged — they're still
`home.hero.dates` and `home.hero.venue` in `messages/fr.json` /
`messages/en.json`, and both still need filling in once confirmed.

**The speakers slider auto-advances.** It focuses each speaker for ~3.8s then
moves on, pausing whenever someone hovers, tabs into it, or opens a card's
detail panel — and it doesn't auto-advance at all for visitors who've asked
for reduced motion. Which speakers appear is still controlled by
`featured: true` in `src/data/speakers.json`. Social links in the detail panel
render only for the networks a speaker actually has filled in, so a speaker
with no socials simply shows none — no empty icons.

**The schedule's sessions are still hardcoded placeholders** inside
`src/components/home/ScheduleOverviewPreview.tsx` (times, tracks, rooms and
titles are all invented structure, not confirmed facts). They're now shaped
like real session records so the eventual `/schedule` route can supply real
data without the component being rebuilt — but until then, editing the
schedule means editing that file, not a JSON file.

**A floating scrollbar** now overlays the right edge of the page instead of
the browser's native one. If JavaScript fails to load, the normal themed
native scrollbar comes back automatically.
