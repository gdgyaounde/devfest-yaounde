# 0098 — After the event: a thank-you hero, and everything closed

Date: 2026-11-22
Status: Accepted

## Context

DevFest Yaoundé 2026 took place on 21 November. The site still said "reserve and pay at the venue", the home page opened on the pre-event hero, and the day-of "Going on now / Coming up next" rows had been added to the schedule.

## Decision

- **Schedule restored.** The "Going on now / Coming up next" feature (ADR 0097) is reverted; `/schedule` is as it was before the day.
- **A third phase, `closed`, replaces `door`.** `salesPhase()` now returns `selling` → `reserving` → `closed`. It closes from `reservationsCloseAt`, **or as soon as the event has ended** if that comes first (it takes the event date), so clearing a cutoff in the dashboard can never reopen sales after the event. Closed means: no payment, no reservation, no "pay at the venue" — for tickets and the shop. The shop stays browsable; its cart, "add" buttons and the reserve page say it is closed. The server already refused anything that is not `selling` (checkout) or `reserving` (reservations), so closing needed no new server rule.
- **The navbar's ticket button is hidden** once closed (nothing to link to), and the first-visit sales pop-up is not shown.
- **Thank-you hero** (`ThankYouHero`) replaces the pre-event `Hero` on the home page. The group photo fills it (the dashboard's hero image); the edition's watermark sits centred along the bottom at its own proportions — `public/brand/watermark-devfest.svg`, the organisers' file used exactly as supplied. No call to action and no paragraph on it.
- **The arrival** (about five seconds after the preloader lifts): the photo settles; "Thank you, Yaoundé." is typed in at the centre — big, bold, stroked, tilted, each letter popping in on the bouncy curve; a flat backdrop draws itself behind each line; after a breath it zooms out and breaks apart into scattering letters and small flat particles; the watermark rises. Pure CSS with seeded pseudo-random scatter (same on server and client). The heading itself is a visually-hidden `<h1>`; under reduced motion the words are simply shown and stay.
- **No navbar over the hero.** `GlobalChrome` keeps the navbar and banner off-screen (and `inert`) on the home page until the visitor has scrolled ~85 % of a viewport, then slides them in; they stay for the rest of the site. Every other route is unchanged.
- **The banner says thank you** once closed (a message typed in the dashboard still wins), with a link to the album when there is one.

## Consequences

Next year, restore the pre-event hero by pointing `page.tsx` back at `Hero` (it is untouched). The FAQs were rewritten for after the event: twelve that only mattered before or on the day were removed (reserving, paying at the venue, T-shirt sizes, what to bring…), and the rest are in the past tense (the "when and where" answer switches tense on its own once the event has ended). The old `door` copy keys were kept and reworded rather than renamed.
