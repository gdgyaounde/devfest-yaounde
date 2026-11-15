# 0072 — The ticketing cutoff: sales close, the shop stays open

Date: 2026-11-15
Status: Accepted

## Context

Ticket sales **and** ticket edits close on **Wednesday 18 November 2026 at
23:59 Africa/Douala** (`2026-11-18T23:59:00+01:00`), three days before the
one-day event (ADR 0071). The site needed to enforce that, say it clearly
beforehand, and stop selling after — without a deploy on Wednesday night and
without the shop going down with it.

## Decision

### One setting, two instants

`site_settings.ticketing` (jsonb, migration **0029**) holds
`{ salesCloseAt, editsCloseAt }`, ISO instants with an explicit offset,
modelled on `cfs.closesAt`. Repo defaults are `TICKET_SALES_CLOSE_AT` /
`TICKET_EDITS_CLOSE_AT` in `src/lib/site-config.ts`, both the Wednesday
cutoff. `loadSettings()` merges the stored blob over them key by key, so the
site reads correctly **before** 0029 is applied. Admin → Config → "Ticket
sales & edits" edits both, in Yaoundé wall time, and only sends the group
when it changed (so other config saves keep working on a database without the
column).

`ticketSalesOpen(now, settings)` / `ticketEditsOpen(now, settings)` in
`src/lib/event.ts` are the only readers. **Closed from the instant on**
(`now >= closeAt`), the same boundary as `eventHasEnded` and the call for
speakers: 23:58:59 is the last second a purchase goes through. The instant
carries its own offset, so a server on UTC agrees. Empty / null means no
cutoff. Two instants so they _can_ diverge; today they are the same minute.
Part C (ticket self-edit) consumes `ticketEditsOpen`.

### Enforced on the server

`assertTicketSalesOpen` runs first in `quoteTierCounts`, which both the price
preview (`/api/checkout/quote`) and the real ticket checkout
(`/api/checkout/tickets` → `quoteTickets`) go through. After the cutoff it
throws `ticket_sales_closed` (409), mapped to bilingual copy under
`errors.checkout`. The UI's closed state is a courtesy on top of this.

- **Only tickets close.** Ticket-only products (commit 2c223a3) are never sold
  alone — `isPurchasable` refuses them and the shop does not list them — so
  they close with the ticket they come with. `quoteCart` never calls the
  guard: **the general shop stays open.**
- **A checkout started before the cutoff and paid after it is honoured.** The
  guard runs when the intent is created, not when PawaPay confirms; a buyer
  who reached the Mobile Money prompt at 23:58 gets their ticket.

### Said clearly, and flipped at the minute

- **Tickets page**: a loud yellow "Ticket sales close Wednesday 18 November
  at 23:59" notice; a live countdown in the final 48 h (the shared
  `ui/Countdown`, extracted from `CfsCountdown`); after the cutoff a closed
  panel pointing at the shop, and every paid tier card in the sold-out style
  with a "Sales closed" pill. The free Haikyu card keeps its Bevy link.
- **Banner**: a derived line, "Ticket sales close Wednesday 18 November at
  23:59", with a "Get tickets" button. Priority: dashboard text → **sales
  close** → call for speakers → fallback. After the cutoff the repo fallback
  ("Early bird tickets end soon") would be false, so it becomes "See you on
  21 November 2026 — ticket sales are closed, the shop is still open."
- **Hero / community band / footer**: `TicketCta` swaps the hero's primary
  button for a disabled "Ticket sales closed" (never a dead link) and removes
  the secondary ticket buttons where another CTA already sits.

The public pages are statically prerendered, so "flipped at the minute" has
three layers:

1. `useBeforeInstant(instant, serverValue)` — a `useSyncExternalStore` clock
   that re-renders at the instant (and on tab focus, for laptops that slept
   through it). Hydration uses the server's value, so no mismatch.
2. The cron sweep rebuilds the whole site during the day after the cutoff
   (`withinSalesCloseRevalidateWindow`, next to the post-event window).
3. Checkout refuses regardless.

### Banner dismissal keyed by message

Dismissal was stored under one fixed sessionStorage key, so closing any
banner silenced every later message for the session — including this one.
It is now keyed by a hash of the shown text (`announcementDismissKey`):
dismissing one message never hides a new one.

### The shop's "may not be ready by event day" notice

The shop (listing, product page, and every step of the bag/checkout) shows:
"You can still order, but items ordered now may not be ready by event day
(Sat 21 Nov). We'll get them to you as soon as they're in." It is hidden once
the event has ended. The same promise was added to the shop consent line
`pages.shop.returnsAck`, which `src/lib/payments/terms.ts` records into
`payment_intents.terms_text`. **Changing that wording only affects orders
placed from the deploy on** — consent already recorded against past orders is
untouched, which is intended: they accepted what they saw.

## Consequences

- Moving the cutoff is a dashboard edit, effective on the next request for
  checkout and on the next rebuild for static pages (saving settings already
  revalidates every page).
- The cutoff is 23:59:00, not 23:59:59. Someone paying at 23:59:30 is
  refused; the copy says "at 23:59", which is accurate.
- Also fixed while verifying: `SwagPreview`'s hidden hover labels took layout
  width on phones and pushed `/tickets` ~70 px wider than the screen, dragging
  the fixed navbar (and its menu button) off the right edge. They are now
  `display: none` at rest, with an `@starting-style` fade-in.
