# 0084 — Payments close at noon, reservations until Friday, cash at the venue

Date: 2026-11-18
Status: Accepted

## Context

DevFest is Saturday 21 November. The organisers decided on Wednesday 18
November: online payments stop at **12:00 that day** (it had been 23:59), for
tickets **and the shop**; from then on **no payment passes through the
platform**. People **reserve** instead, until **Friday 20 November, 23:59**;
after that they come to the venue and pay **cash**. The venue is **FMSB
Yaoundé, Amphi 350**, to be shown on the site with one exact map link, and the
section right after the hero should lead with the date and the venue.

## Decision

1. **One phase, everywhere.** `salesPhase(now, settings)` →
   `selling | reserving | door`, from `ticketing.salesCloseAt` (12:00 Wed) and
   the new `ticketing.reservationsCloseAt` (23:59 Fri) — the same jsonb column
   as the existing cutoffs, so no migration for the dates. A cleared field
   never shuts a door. `SalesPhaseProvider` follows the clock at the minute
   (the pages are static), and the banner, navbar button, hero/footer CTAs,
   tickets notice, shop buttons and notice, prices, pop-up and FAQs all read it.

2. **The server refuses, not just the UI.** `assertPaymentsOpen` runs in
   `quoteCart` and in `startCheckout` — the one function that creates a payment
   intent for either kind. The PawaPay callback and status poller stay open, so
   a payment started before noon still finishes.

3. **Reservations** (`reservations` table, migration 0034): RLS on, no
   policies; created by `create_reservation`, which counts paid tickets AND
   live reservations per tier against the tier's cap under one lock, and caps
   live reservations per account at 3. Prices are BASE prices (cash has no
   online fee), computed from the catalog on the server; the body carries no
   price. Sign-in required. Cancel by the owner until Friday 23:59 and only
   while `reserved`. The Friday deadline is enforced by the route from settings.
   If 0034 isn't applied the route answers 503 and writes nothing.

4. **Prices drop the 1.5 % online fee once payments close** (`useDisplayPrice`),
   so a card never shows one number and a reservation another.

5. **The door.** Volunteers (and admins) search a reservation by reference or
   name, see what was reserved and the cash owed — never the phone or email —
   and record cash / check in; both are row-locked and idempotent. Meal and swag
   tables are NOT extended to cash reservations (follow-up if wanted).

6. **Admin.** A Reservations view (list, filters, CSV with phone/email), and
   the commerce recap counts reservations as their own column, boxes included.

7. **Pop-up in two steps**: terms (only if unseen) then a phase-aware notice,
   remembered per phase; someone who saw the terms goes straight to step 2.

8. **Venue**: `EVENT.venue = "FMSB Yaoundé"`, room "Amphi 350", the organisers'
   coordinates, and ONE map link — the exact pin. No embedded map (no CSP
   change), no street address (none confirmed), the abbreviation unexpanded.
   The home page's second section is a lively date/venue band; the hero leads
   with FMSB and shows the city as its caption.

## Consequences

- Phase B needs migration `0034` applied; until then reserving says it is
  unavailable. Everything else works without it.
- The home page's server-rendered banner and prices are rebuilt by the cron
  within minutes of each switch; client pieces flip at the minute.
- No confirmation email (no sending domain): the reference is on screen and in
  "My reservations".
- Free passes are still RSVP'd on the community page.
