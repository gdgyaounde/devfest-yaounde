# 0098 — After the event: a thank-you hero, and everything closed

Date: 2026-11-22
Status: Accepted

## Context

DevFest Yaoundé 2026 took place on 21 November. The site still said "reserve and pay at the venue", the home page opened on the pre-event hero, and the day-of "Going on now / Coming up next" rows had been added to the schedule.

## Decision

- **Schedule restored.** The "Going on now / Coming up next" feature (ADR 0097) is reverted; `/schedule` is as it was before the day.
- **A third phase, `closed`, replaces `door`.** `salesPhase()` now returns `selling` → `reserving` → `closed`. It closes from `reservationsCloseAt`, **or as soon as the event has ended** if that comes first (it takes the event date), so clearing a cutoff in the dashboard can never reopen sales after the event. Closed means: no payment, no reservation, no "pay at the venue" — for tickets and the shop. The shop stays browsable; its cart, "add" buttons and the reserve page say it is closed. The server already refused anything that is not `selling` (checkout) or `reserving` (reservations), so closing needed no new server rule.
- **The navbar's ticket button is hidden** once closed (nothing to link to), and the first-visit sales pop-up is not shown.
- **Thank-you hero** (`ThankYouHero`) replaces the pre-event `Hero` on the home page: the group photo behind, a two-stamp "Thank you, Yaoundé." heading, a short note, the album link, and the watermark along the bottom edge. The photo is the dashboard's hero image; the watermark is `public/brand/watermark-devfest.svg` (replace the file).
- **No navbar over the hero.** `GlobalChrome` keeps the navbar and banner off-screen (and `inert`) on the home page until the visitor has scrolled ~85 % of a viewport, then slides them in; they stay for the rest of the site. Every other route is unchanged.
- **The banner says thank you** once closed (a message typed in the dashboard still wins), with a link to the album when there is one.
- **A soft, short arrival**: the photo settles (3.2 s), the two words surface one after the other, the note and buttons breathe in, the watermark band rises last — about four seconds, held behind the preloader like the old hero, and off under `prefers-reduced-motion`.

## Consequences

Next year, restore the pre-event hero by pointing `page.tsx` back at `Hero` (it is untouched). The `FAQ` entries about reserving and paying at the venue are now out of date and should be revised (or hidden) in the dashboard. The old `door` copy keys were kept and reworded rather than renamed.
