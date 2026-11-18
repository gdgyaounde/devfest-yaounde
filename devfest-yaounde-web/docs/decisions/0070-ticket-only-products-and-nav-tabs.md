# 0070 — Ticket-only products, hideable navbar tabs, and a few storefront fixes

Date: 2026-09-23
Status: Accepted (PHASE24) — **amends [0054](0054-swag-references-shop-products.md)**
(a tier's swag now resolves against published products _including_ ticket-only ones)

## 1. Ticket-only products

**The gap.** A tier's swag is a reference to a shop product (ADR 0054), and the
ticket page resolved those references against the products the _shop_ shows. So
a certificate — something that comes WITH a ticket and should never be sold on
its own — had two bad options: leave it published, where anyone could see it in
the shop and order it; or hide it, where it vanished from the ticket too.

**The decision.** A product gets an optional `ticketOnly: true` (absent = an
ordinary shop product). Three states, kept apart in one small module
(`src/lib/content/product-visibility.ts`):

| state                       | shop list / page / cart / sitemap | orderable | shown as swag on a tier |
| --------------------------- | --------------------------------- | --------- | ----------------------- |
| shop product                | yes                               | yes       | yes                     |
| **ticket-only**             | **no**                            | **no**    | **yes**                 |
| hidden (`published: false`) | no                                | no        | no                      |

`getProducts()` is the **shop** view (published and not ticket-only) — which is
also what checkout prices against, so a ticket-only product is unknown to a
hand-built request. `getSwagProducts()` is the **ticket** view (published,
ticket-only included). `isPurchasable()` additionally refuses a ticket-only
product outright, so the rule holds even for a caller that hands it an
unfiltered list. `ticketOnly` does not override `published: false`: an
unfinished listing stays off the ticket cards too.

**Admin.** A _Ticket-only_ switch on the product; the list shows "Ticket-only —
not sold in the shop" instead of a price and has a filter chip; a ticket-only
product can be published without a price or picture (the ticket card shows a
placeholder for a missing image), and the "incomplete products" badge on the
Shop nav item no longer counts it.

**Not done on purpose:** a ticket-only product that was already in somebody's
bag simply stops resolving and is refused at checkout like any unknown product.

## 2. Show / hide navbar tabs

A `nav` group in `site_settings` (migration **0027**, a jsonb column like every
other settings group): one boolean per tab — Schedule, Speakers, FAQs, Team,
Shop, Tickets. The language switch is not in it and always stays. Absent, or a
key missing from the blob, means _shown_: an older blob can never hide a tab by
omission.

- `src/lib/nav-tabs.ts` is the one client-safe definition of the tabs and their
  order; the navbar, settings loader, dashboard and tests share it.
- The dashboard's **Navigation** panel (Config) has its own save. `nav` lives in
  a newer column, and sending it with every other setting would make the whole
  config save fail on a database that has not had 0027 — the same reason Memory
  Lane's links are sent only when they change. Saving always sends the WHOLE
  group (`saveSettings` replaces the column); the schema is `.strict()` and
  requires every key, so a partial write is refused rather than silently
  un-hiding a tab.
- **It hides the links, not the page.** The tabs are removed from the navbar
  **and the footer** (which repeats them: Schedule/Speakers/Team/FAQs in its
  Event column, Shop under Get involved, and the Tickets call-to-action button
  in the closing band; the Event heading goes too when all four are off). The
  page still exists at its URL and buttons elsewhere (on the home page) that
  point at it still work. Taking a page down is a different decision,
  deliberately not made here. _(The footer was added in a follow-up — the first
  cut only touched the navbar.)_
- **A footer-only switch: `dpGenerator`.** The footer's DP generator and
  Community wall links are governed by one extra key (`FOOTER_ONLY_KEYS` in
  `nav-tabs.ts`; it has no navbar link and is not in the navbar preview). It is
  one boolean for two pages by design — the wall is where the generator's cards
  end up — so they show or hide as a pair; there is no separate `wall` key and
  the schema refuses one. Like every key it is required in a save (a stale
  admin tab that predates it is refused rather than silently un-hiding), while a
  stored blob that lacks it simply reads as _shown_.
- Deploy order: apply 0027 to _save_; reading is safe before it (`select *`,
  every tab shows).

## 3. Storefront fixes in the same change

- **Free-tier swag never showed.** The free (`rsvpExternal`) tier's card is a
  separate branch from the paid tiers' and never rendered `SwagPreview`, so
  anything attached to the free pass — the certificate — was invisible. It now
  renders there too. (The count label also became a proper plural: "1 thing in
  the box".)
- **Shop cards are equal height.** The grid used `items-start`; cards now stretch
  to the tallest in their row with the price pinned to the bottom.
- **"Didn't find your answer?"** after the last FAQ (and after "no results"): a
  question box **pre-filled from the FAQ search** (the visitor's own edits win
  from then on), an optional name, and a button that opens their mail app with
  the subject and message composed around those two fields (`mail.faqMissing`,
  both languages). A plain mail link built by `mailtoHref` — nothing is posted or
  stored.
- `use-cart.ts` returned a fresh `[]` as its server snapshot on every call, which
  React warns about in development ("getServerSnapshot should be cached").
  Pre-existing; it is now one shared empty array.

## Verified

Unit tests for the visibility rule and the nav schema/links; in a real browser:
card heights per row equal on the live catalogue, the free tier shows its swag
(the live "Official Certificate"), the FAQ CTA seeding/edit/name behaviour, the
navbar with none / some / all tabs hidden (language switch always present), and
the admin Navigation and ticket-only screens. **Not run against the live
database:** saving a nav change or marking a product ticket-only writes real
site data, so those paths were exercised through the UI and tests, not
persisted; migration 0027 is shipped, not applied.
