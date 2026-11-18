# Updating the Navbar, Announcement Banner, and Footer

These three pieces appear on every page of the site. This guide is for changing what they say or link to — not for redesigning how they look.

## Changing the announcement banner message

### What the banner says, in order (ADR 0072)

The banner shows the FIRST of these that applies:

1. **Whatever is typed in Admin → Config → Announcement.** Always wins.
2. **The payments cutoff** — "Online payments close Wednesday 18 November at
   12:00", with a "Get tickets" button. Once it passes, the banner moves on to
   **"Reservations are open until Friday 20 November at 23:59"** (with a
   "Reserve" button) and, after Friday, to **"pay cash at the venue"**. Built from Config → Ticket sales &
   edits, so it always matches what checkout enforces. It disappears by
   itself at the cutoff (the open page folds it away at the minute; the
   static pages are rebuilt by the cron sweep shortly after).
3. **The call for speakers**, while it is accepting submissions.
4. **The fallback** below — or, once ticket sales have closed, "Reservations are
   closed — see you on 21 November 2026 at FMSB Yaoundé! Pay cash on the spot"
   (`announcement.afterSales`), because the fallback sells tickets.

**Dismissing is per message.** A visitor who closes the banner only hides
that exact text for their session; when the message changes (a new dashboard
announcement, or the sales line giving way to the after-sales line), it shows
again. Before November 2026 one close silenced every later message.

### The fallback text

The fallback lives in the translation files, not in any component code:

- French: `messages/fr.json` → `announcement.message`
- English: `messages/en.json` → `announcement.message`

Edit both — the site requires both languages before a change counts as "done." Keep it short; long messages scroll (marquee), which is fine, but very long text is harder to read while scrolling.

**To hide the banner entirely** for now, an organizer without dev help would need to ask a developer to remove it from `src/components/global/GlobalChrome.tsx` — there's no on/off toggle yet. Note that visitors can dismiss it themselves; the navbar then smoothly collapses the space and the whole bar morphs into a pill. If frequent on/off toggling turns out to be needed, that's worth a small follow-up feature (a `announcement.enabled` flag in the messages file or a config file), not something to hack in on the spot.

## The "terms updated" pop-up (ADR 0074)

When the participation terms change, every visitor sees a short pop-up once —
"Our participation terms have changed", with "Got it" and "Read the terms".
It is remembered per browser **per terms version**.

**To show it again after changing the terms:**

1. Edit the terms copy (`messages/{fr,en}.json` → `pages.terms`, and the
   pop-up summary under `termsPopup` — both languages).
2. In **Admin → Config → Legal links**, change **Terms version** (use the
   date, e.g. `2026-12-01`) and set **Last updated** to the same day.
3. Save. Everyone sees the pop-up once more on their next visit; people who
   already dismissed the old version are asked again, which is the point.

Changing only the copy, without a new version, updates `/terms` silently —
nobody is shown the pop-up. The pop-up never appears on `/admin`, on `/terms`
itself (reading the page counts as seen) or on the full-screen wall, and it
waits for the loading screen and the hero animation before it opens.

## Changing nav links, Shop/Get Tickets button labels

Labels: `messages/fr.json` and `messages/en.json` → `nav.*` keys.

Adding or removing an actual link (not just relabeling) requires a code change in `src/components/global/Navbar.tsx` (the `NAV_LINKS` array) — a developer task, not a content-only edit.

## Changing footer links and social profiles

- **Link labels** (e.g. "Schedule", "Join the Community"): `messages/fr.json` / `messages/en.json` → `footer.*` keys.
- **Where links actually point**: the legal links, the Bevy community URL and the two calls are **settings**, edited in the dashboard under Configuration — `src/lib/site-config.ts` only holds the fallback a fresh clone renders with (ADR 0038). Social profile URLs are still constants in that file.

## Known gaps as of this bootstrap

- **No real logo image** — the navbar shows a text wordmark ("DevFest Yaoundé") since no logo asset was supplied. Swapping in a real logo is a `Navbar.tsx` code change.
- **No real community photos** — the footer's top strip is a flat Yellow 600 CTA block, not an actual photo strip. `DESIGN.md` §4.1 requires real photos here; this needs a developer to swap in actual images once they exist. (It was a gradient block until the design-foundation pass; gradients are now banned outright per `DESIGN.md` §2.6, so whatever replaces it must be flat fills or real photography.)
- **The legal links are somebody else's pages, deliberately** — GDG's participation terms and Google's privacy policy and terms. The chapter runs under those and publishes none of its own, so there are no routes for them and they are not in the sitemap. There is **no code of conduct entry**: the participation terms are that document here (ADR 0040).
- **Bevy chapter URL is a placeholder** — every "RSVP" / "Join the Community" link points at `#` until the real GDG Yaoundé Bevy URL is added to `site-config.ts`.

## The logo easter egg

Clicking the "DevFest Yaoundé" wordmark 6 times quickly (within about 1.5 seconds) triggers a confetti burst. This is documented in `/EASTER-EGGS.md` — check there before adding a new easter egg so it doesn't collide with this one.

## Phase 7: the footer changed shape

The footer is now a **full-page closing moment** (about one screen tall) with
a mixed layout: an oversized DevFest wordmark on one side, the three link
groups on the other, then an invitation band with a ticket button, then the
social icons and copyright line.

The big community-photo block with the RSVP button on it **has been removed**
— both because the photo/CTA block wasn't wanted, and because the RSVP action
itself was retired (`docs/decisions/0008-retire-bevy-rsvp.md`). The footer's
main button now goes to `/tickets`.

Editing footer links and labels is unchanged: labels live under `footer.*` in
`messages/fr.json` / `messages/en.json`, and the actual URLs (socials, Bevy,
Privacy, Terms) fall back to `src/lib/site-config.ts` when the database has
nothing saved.
