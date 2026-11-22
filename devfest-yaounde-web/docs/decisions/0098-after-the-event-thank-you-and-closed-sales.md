# 0098 — After the event: a thank-you hero, and everything closed

Date: 2026-11-22
Status: Accepted

## Context

DevFest Yaoundé 2026 took place on 21 November. The site still said "reserve and pay at the venue", the home page opened on the pre-event hero, and the day-of "Going on now / Coming up next" rows had been added to the schedule.

## Decision

- **Schedule restored.** The "Going on now / Coming up next" feature (ADR 0097) is reverted; `/schedule` is as it was before the day.
- **A third phase, `closed`, replaces `door`.** `salesPhase()` now returns `selling` → `reserving` → `closed`. It closes from `reservationsCloseAt`, **or as soon as the event has ended** if that comes first (it takes the event date), so clearing a cutoff in the dashboard can never reopen sales after the event. Closed means: no payment, no reservation, no "pay at the venue" — for tickets and the shop. The shop stays browsable; its cart, "add" buttons and the reserve page say it is closed. The server already refused anything that is not `selling` (checkout) or `reserving` (reservations), so closing needed no new server rule.
- **The navbar's ticket button is hidden** once closed (nothing to link to), and the first-visit sales pop-up is not shown.
- **Thank-you hero** (`ThankYouHero`) replaces the pre-event `Hero` on the home page. The group photo (the dashboard's hero image) is shown as a **panorama** (`PhotoPanorama`): full hero height, never cropped; where it is wider than the screen it starts centred and pans sideways (swipe, trackpad, arrow keys, mouse drag), with a small "drag or swipe to see everyone" hint once the intro is over, gone at the first pan; where it is narrower it sits on a blurred copy of itself. The organisers' watermark (`public/brand/watermark-devfest.svg`, used exactly as supplied) is centred along the bottom. No call to action, no paragraph.
- **The arrival** (about five seconds after the preloader lifts): the photo settles; "Thank you, Yaoundé." is typed in at the centre — big, bold, heavily stroked, tight tracking, a slight tilt, each letter popping in on the bouncy curve; a square flat backdrop draws itself behind each line (the two overlap); after a breath it zooms out and breaks apart into scattering letters and small flat particles — and a few of those particles fly out and settle on the photo as **pinging hotspots**. The watermark rises last. Pure CSS with a seeded scatter. The heading itself is a visually-hidden `<h1>`; under reduced motion the words are simply shown and stay.
- **Hotspots** (`HeroFacts`, data in `src/data/hero-facts.json`: position in % of the photo, value, label, detail): hover, focus or tap a dot and a card grows out of the corner the dot sits in (clip-path between two `inset()` shapes), each card with its own slight tilt, the figure on a flat tag of the theme colour; it folds back into the dot on leave. Only verified figures go in (lineup, agenda, DP generator, Storytime).
- **No navbar over the hero.** `GlobalChrome` keeps the navbar and banner off-screen (and `inert`) on the home page until the visitor has scrolled ~85 % of a viewport, then slides them in; they stay for the rest of the site. Every other route is unchanged.
- **The banner says thank you** once closed (a message typed in the dashboard still wins), with a link to the album when there is one.

## Consequences

Next year, restore the pre-event hero by pointing `page.tsx` back at `Hero` (it is untouched). The FAQs were rewritten for after the event: twelve that only mattered before or on the day were removed (reserving, paying at the venue, T-shirt sizes, what to bring…), and the rest are in the past tense (the "when and where" answer switches tense on its own once the event has ended). The old `door` copy keys were kept and reworded rather than renamed.
