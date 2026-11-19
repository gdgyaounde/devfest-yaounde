# 0088 — Offline agenda, for real: save it, find it, keep your favourites

Date: 2026-11-19
Status: Accepted (builds on ADR 0066, ADR 0086)

## Context

ADR 0066 made Schedule, Speakers, Team and FAQs work offline, but only for a page that had been loaded while the service worker was already in control. In practice: a visitor who had only opened the home page, or whose first-ever visit was the schedule, had nothing offline; the installed app's start page failed with the browser's error page; photos were missing; and favourites ("This interests me") need the server, so they vanished with no signal. For the day itself (patchy venue network) that is the case that matters.

## Decision

The 0066 rule is unchanged and still the most important line in `public/sw.js`: tickets, shop, reservations, payments, account, admin and every API are never intercepted, cached or served stale.

- **Save the agenda.** The page can ask the worker (a `precache` message) to download the four pages of the visitor's language now, then the scripts, styles, fonts, sponsor logos and one photo size per speaker found inside them. This runs quietly after the first visit (idle, not on data saver, not offline, at most every 6 hours) and on demand from the pop-up. Cache `devfest-offline-v2`.
- **The front door.** Opening the home page offline (the installed app's start URL) redirects to the cached Schedule of that language (or the other language if only that one was saved). Only the home page gets this; nothing else falls back, and `/tickets` still fails outright offline.
- **Photos.** `/_next/image` is cached, and offline any cached size of a photo stands in for another.
- **Favourites.** While signed in, the schedule keeps a copy of the marked session ids in the browser (`devfest:interests:v1`; ids only). If the server cannot be reached, that copy is shown: hearts appear filled, read-only (a change the server never saw would disagree later). A new "My sessions · n" filter on the schedule works from the same copy, and the full-screen reader then steps through just those. An answer of "not signed in" clears the copy.
- **Pop-up step 5, "Keep the agenda with you".** Shown once, only where a service worker can exist. One button saves the agenda, shows progress, confirms "The agenda is on your device", or offers a retry.

## Verified

Against a production build (`next build` + `next start`), with the service worker's own network emulated offline (page-level offline mode does not reach it): after only opening `/en`, the quiet save cached all four pages, 29 static files, 31 photos and the fonts; offline, all four pages and 36 sessions load; `/`, `/en` and `/fr` land on the cached Schedule; `/en/tickets` fails. With a device copy of favourites and no connection, the filter shows exactly those sessions and the hearts say to reconnect to change them.

## Consequences

- A few hundred KB to a few MB on first save, mostly photos; a visitor on data saver is not saved to automatically, but the pop-up still offers it.
- Pages refresh on any online visit (stale-while-revalidate, as in 0066), so a later agenda change reaches them.
- Lazily loaded chunks not on the page at load time (rare) are cached only after first use.
