# 0063 — A 1.5% transaction fee, computed at display and checkout time, never stored

Date: 2026-09-16
Status: Accepted — **rounding rule amended by [0068](0068-round-up-to-nearest-50.md)** (the fee itself, where it is computed, and the discount ordering all stand; only "rounded to the nearest whole franc, half up" is superseded — see 0068)

## What

Every price a visitor or buyer sees, and every amount actually charged,
now includes a 1.5% transaction fee on top of the catalog's stored base
price — tickets and shop alike. `displayed = base × 1.015`, ~~rounded to the
nearest whole franc~~ (now rounded **up to the next 50 XAF** — ADR 0068).

**The base price is the only thing stored, and the only thing an admin
edits.** `tier.priceXAF` / `product.priceXAF` in `ticket-tiers.json` /
`products.json` (or their dashboard-edited overrides) never changes
meaning — it stays the fee-free number it always was. The fee is computed
at render time and at checkout time, from one shared function, every time.
This is what makes it apply automatically to every tier and product that
exists today, and every one an admin adds later, with no per-item
migration and no risk of a stored price silently drifting from what a
buyer is actually shown.

## The one function everything calls

`src/lib/payments/fees.ts` — deliberately NOT `server-only`, and
deliberately the only place the 1.5% figure or its rounding rule appears
in code:

```ts
export function feeInclusiveAmount(base: number): number {
  return Math.round((base * 1015) / 1000);
}
export function transactionFeeAmount(base: number): number {
  return feeInclusiveAmount(base) - base;
}
```

- **Not `server-only` on purpose.** This is pure arithmetic on a number
  already public (a tier or product's listed price) — it has to run in two
  places that must never disagree: the server's real pricing
  (`pricing.ts`'s `finalise()`, which is what gets charged) and the
  browse-time "sticker price" on a tier or product card, shown before a
  basket or a discount exists at all. One shared function, imported by
  both, is what makes "the buyer never sees one number and is charged
  another" a guarantee rather than an intention.
- **Rounding: half up**, the rule a buyer expects ("1.5% of 1000 is 15, so
  1015" — not 1014 because floating point landed a hair under .5). The
  multiply happens in integer space first (`base * 1015`, exact for any
  integer `base`), and only the single unavoidable division touches
  floating point, at a scale where IEEE754 error is far below the 0.5 that
  would ever flip a rounding decision. Verified directly: `feeInclusiveAmount(100)`
  (the exact-half case, 101.5) returns 102, not 101.
- **Zero in, zero out.** `feeInclusiveAmount(0) === 0`. A genuinely free
  ticket (Haikyu, handled off-site) or a 100%-discounted order stays
  exactly free — nothing to special-case anywhere the fee is applied,
  because the function already does the right thing at the boundary.

## Where it joins the total, and why the order matters

`pricing.ts`'s `finalise()` — the single function every server-side price
(tickets and shop) already ran through before this — now does:

```ts
const subtotal = lines.reduce(...);              // base, unchanged
const discountAmount = discount ? applyDiscount(subtotal, discount) : 0;
const net = subtotal - discountAmount;            // base, post-discount
const feeAmount = transactionFeeAmount(net);
const charged = net + feeAmount;                  // what's actually charged
```

**The discount is computed against the BASE subtotal, and the fee is added
once, to what's left after that — never the other way round.** A discount
takes a percentage off what a ticket or product actually costs; it has
nothing to do with a fee that exists to cover payment processing. Applying
the fee first and discounting the fee-inclusive total would mean a
discount code also shrinks the fee, which "1.5% transaction fee" does not
mean. This was PHASE22's own explicit instruction, confirmed rather than
assumed.

**`net` is the base, post-discount amount — what the event actually
earns**, reusing a field `pricing.ts` had reserved for exactly this since
before this fee existed (the old comment: _"kept separate so a future
gateway fee has somewhere to live without rewriting every stored
intent"_). `admin/data.ts`'s `settledRevenue` headline already summed
`net_amount`, not `charged_amount`, for "what the chapter actually
received" — that was already correct in spirit, and now it is correct in
fact: the 1.5% is real money the buyer pays but not real ticket/product
revenue, and it now falls out of that number automatically rather than
needing a code change to exclude it.

## Line items stay base; the fee is ONE row, never split per line

A tier or product's own "sticker price" (tier cards on `/tickets`,
product cards and detail on `/shop`) shows `feeInclusiveAmount(base)` —
what buying exactly one costs, right now, with no basket or discount in
the picture yet.

Inside a multi-item basket (the order summary, the shop bag, the email
receipt), individual line items keep showing BASE price × quantity — the
fee is surfaced exactly once, as its own row, the same way the discount
already is:

```
Subtotal            7 000
Transaction fee (1.5%)   105
─────────────────────────
Total to pay        7 105 XAF
```

**This is a deliberate choice, not an oversight**, and it does mean a tier
card's displayed unit price × quantity can differ from the basket's actual
line total by a franc or two — rounding once on a bulk total vs. rounding
per unit and multiplying out are not always identical at this scale. Two
reasons this is the right trade rather than a bug to chase:

1. **The alternative is structurally impossible given the discount
   ordering above.** If every line item already had the fee baked in,
   "discount computed on the base, fee applied once to what's left" stops
   being expressible — you cannot cleanly discount a number that already
   contains a fee and then apply the fee again without either double-fee'ing
   or having to reverse-engineer the base back out of the line. The
   instruction that fixed the discount/fee order effectively fixed this
   too.
2. **It's the same convention "VAT-inclusive shelf price, itemised tax at
   the till" already uses everywhere this pattern exists** — a browsing-time
   unit price answers "what does one cost," a checkout basket answers
   "what does this specific order cost, and why," and nobody expects those
   two questions to trace through to the same number to the franc once
   quantity, a discount and a fee are all in play. This is also, not
   incidentally, the more transparent of the two available designs
   compared to a base-price teaser with the fee sprung at the very end —
   the number on the tier card IS what one ticket costs.

## What was actually verified, end to end, not just unit-tested

Every layer was checked against the REAL, already-live catalog data in
this environment (read-only, per the standing rule) rather than only the
repo's seed JSON:

- Ticket tier cards (`/tickets`) and the sticky order summary: adding 2×
  Sonnet showed `Subtotal 7 000 / Transaction fee (1.5%) 105 / Total to
pay 7 105 XAF` — exactly `feeInclusiveAmount(7000)`.
- Shop product cards, product detail, the bag, and its order summary:
  adding one mug (base 2 000) showed `Subtotal 2 000 / Transaction fee
30 / Total to pay 2 030 XAF` — exactly `feeInclusiveAmount(2000)`.
- Both screenshotted again in French, confirming `Frais de transaction
(1,5 %)` and the totals agree.
- A real receipt email rendered with a discount present (`net 3 600,
discount 400, fee 54, total 3 654`) showed all four rows in the right
  order, matching the exact arithmetic above.

## Downstream paths that needed NO code change, because they already

## threaded `PricedBasket.charged` end to end

Traced before writing anything, not assumed:

- `checkout.ts` sends `String(input.quote.charged)` as the literal amount
  to PawaPay — already `finalise()`'s output, so it became fee-inclusive
  automatically.
- `intents.ts`'s `create_payment_intent` RPC already accepted
  `p_charged_amount` and `p_net_amount` as two separate parameters (the
  columns have existed since the original schema) — no migration needed.
- `/api/payments/status` and `PaymentReturn.tsx` already read
  `intent.charged_amount` for the confirmation screen's "amount charged."
- `orders.total_amount` is written from `v_intent.charged_amount` inside
  `apply_paid_deposit` — the shop order record was already fee-inclusive
  the moment `finalise()` changed.
- The amount-mismatch check in `apply.ts` already compares what PawaPay
  reports paid against `intent.charged_amount` — the same number that was
  sent, so the comparison stays correct with no logic change.

This is the entire reason the change was safe to make in one function: the
codebase already had exactly one place money became a number, and
everything else was already built to read that number rather than
recompute it.

## What DID need a fix beyond `finalise()`

- **Two pre-existing bugs in the receipt email**, found while adding the
  fee row: `totalsHtml`/`totalsText` reconstructed the subtotal as
  `charged_amount + discount_amount`. That was correct before the fee
  existed (`charged === net` then); now `charged_amount` includes the
  fee, so the old formula would have overstated the base subtotal by the
  fee amount. Fixed to `net_amount + discount_amount`, which is always the
  true base regardless of the fee.
- **JSON-LD product pricing** (`shop/[product]/page.tsx`) now uses
  `feeInclusiveAmount()` too — Google's own rich-result guidance treats a
  structured-data price that doesn't match checkout as a violation, and
  the crawler reading that markup is acting on behalf of a visitor exactly
  as much as the page it's describing.
- **`/api/account/tickets`** now also selects `net_amount` and returns
  `order.feeAmount`, and the account "My Tickets" screen shows it as its
  own row next to the existing discount row — that view already broke
  the order down into price/discount/total, so it gets the same
  itemisation the order summary and the receipt do. **`/api/account/orders`
  ("My Orders") was deliberately left as a flat total, unchanged** — it
  never itemised subtotal/discount before this either, its `total_amount`
  is already correctly fee-inclusive with zero risk of drift, and adding a
  breakdown there would be new scope beyond "apply the fee consistently to
  what's already shown," not a fix to something the fee broke.

## Admin: base and computed, side by side, never one replacing the other

`AdminTicketTiers.tsx` and `AdminShop.tsx`'s price field is unchanged —
still the base, fee-free number an organiser types. Its hint text now
computes and shows the fee-inclusive customer price live as they type, and
the list row underneath shows both numbers. `AdminTransactions.tsx` gained
a `Fee` column (`chargedAmount - netAmount`) alongside the existing
`Charged`/`Net` columns, and its subtitle now explains what each one means
— those two columns already existed, side by side, before this fee did;
they simply meant the same number until now.

## Verified

- New `fees.ts` tests: exact 1.5% at round numbers, half-up rounding at
  the precise .5 boundary, zero-in-zero-out, `transactionFeeAmount` always
  equal to the difference, always an integer output.
- Every existing `pricing.ts` test asserting an exact `charged` value
  updated to expect `feeInclusiveAmount(base)` instead of `base` — nothing
  was silently left checking the pre-fee number.
- New assertions on `basket.net`/`basket.feeAmount` confirming
  `charged === net + feeAmount` exactly, not merely close.
- New receipt-email tests: the fee row appears with the right label and
  the right amount when non-zero, computed off the true base (not the
  fee-inclusive `charged_amount`), and is hidden — same rule as the
  discount row — when it computes to zero.
- `npm run verify` (205 tests, lint, typecheck) and `npm run build` pass.
  No new dependency; no gradients introduced.

## Consequences

- A tier or product's displayed unit price and its line-item total inside
  a multi-item basket can differ by up to a franc or two once quantity,
  a discount, and rounding are all in play — documented above as a
  deliberate, standard trade, not a bug.
- `admin/data.ts`'s `settledRevenue` headline now genuinely excludes the
  fee from reported revenue (previously the distinction existed in the
  code's intent but not in the numbers, since `net === charged` before
  this). Anyone reconciling against PawaPay's own settlement reports
  should expect PawaPay's number to match `charged_amount`, not
  `settledRevenue`.
- `/api/account/orders` (My Orders) shows a fee-inclusive total with no
  itemised breakdown — a real difference from the Tickets tab now. If a
  shop-side breakdown is wanted later, it needs the same `net_amount`
  join `/api/account/tickets` already has; nothing about this change makes
  that harder, it just wasn't in scope for making the fee itself correct.
