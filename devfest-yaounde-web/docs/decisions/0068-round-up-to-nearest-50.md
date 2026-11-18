# 0068 — Fee-inclusive prices round UP to the next 50 XAF

Date: 2026-09-20
Status: Accepted (PHASE23 §A) — **amends the rounding rule in [0063](0063-transaction-fee.md)**

## What changed

```
displayed_price = ceil((base_price × 1.015) / 50) × 50
```

This replaces "base × 1.015, rounded to the nearest whole franc, half up".
Everything else in 0063 stands: the base price stays the stored,
fee-free source of truth; the number is computed at render/checkout time,
in one function (`feeInclusiveAmount`, `src/lib/payments/fees.ts`);
`finalise()` in `pricing.ts` is still the only place it joins a basket.

It is written as one ceiling, not a branch on divisibility: a figure that
already lands on a multiple of 50 is left alone because the ceiling has
nothing to do.

| base             | × 1.015 | displayed / charged    |
| ---------------- | ------- | ---------------------- |
| 2 000            | 2 030   | **2 050**              |
| 5 000            | 5 075   | **5 100**              |
| 10 000           | 10 150  | **10 150** (unchanged) |
| 25 000           | 25 375  | **25 400**             |
| 12 000 (product) | 12 180  | **12 200**             |
| 3 000 (product)  | 3 045   | **3 050**              |

Applies to every existing and future tier and product with no data edit —
nothing rounded is ever stored.

## Float safety, and why the numerator is an integer

The formula is implemented as `Math.ceil((base * 1015) / 50000) * 50`. The
multiply stays in integer space and the one division is by an integer, so a
figure that is mathematically an exact multiple of 50 divides to an exact
integer — it cannot be nudged past the boundary by float drift and cost the
buyer an extra 50. Verified against exact BigInt arithmetic for every base
from 0 to 2 000 000 (and in the test suite for 0–60 000 plus a coarser sweep
to 5 000 000). The naive `base * 1.015` form also happened to agree over
that range; the integer form is kept because it is correct by construction
rather than by luck.

## The charge equals the display — traced, not assumed

Nothing downstream recomputes; every consumer reads the one `PricedBasket`:

- Card/sticker prices: `feeInclusiveAmount(base)` (tier cards, product cards
  and detail, JSON-LD `Offer.price`).
- Server basket: `finalise()` → `feeInclusiveAmount(net)`; `charged` is that.
- PawaPay: `checkout.ts` sends `String(input.quote.charged)`.
- `payment_intents.charged_amount` / `orders.total_amount`: written from the
  same `quote.charged`; the amount-mismatch check in `apply.ts` compares the
  amount PawaPay reports to `intent.charged_amount`.
- Receipt email / account: `feeAmount = charged_amount − net_amount`.

A test walks every real ticket tier and shop product and asserts the server
basket's `charged` equals the number its card displays.

## Discount order — unchanged, re-confirmed

Discount on the **base** subtotal first; then fee + round-up **once** on what
is left. Worked case: 5 000 base, 10% off → net 4 500 → 4 567.5 → **4 600**
charged. Rounding the sticker first (5 100) and taking 10% off that would give
4 590 — a different number, and not what is charged. Kept because a code
should take a percentage off what the item costs, not off a fee or a rounding
step; it is also what lets the summary show `subtotal − discount + fee =
total` with no row that has to explain itself.

## Consequences worth knowing

- **The "fee" row is now the fee and the round-up together** (`feeAmount =
feeInclusiveAmount(net) − net`), so rows always add up to the charged total.
  A 3 600 net pays a 100 line (2.8%), not 54, which is why the label now says
  "1.5%, rounded up to the next 50 XAF" in both locales, the receipt email,
  and the account view — a bare "1.5%" would have been untrue.
- **Rounding is applied once to the basket, not per unit** (brief: "apply the
  fee+rounding to the post-discount total"). Three SONNET tickets show 2 050
  each on the card (6 150) but charge **6 100**. The charge is never higher than
  quantity × the displayed unit price, only lower or equal — the buyer is never
  charged more than the cards suggest. (0063 documented the same trade at
  franc scale; at 50 it can be up to 49 × (n−1) lower.)
- **A tiny post-discount remainder costs 50 XAF minimum** (10 XAF left after a
  code → 50 charged). A fully discounted order is still exactly 0 and still
  takes the free path.
- **The admin shows both prices, labelled** (follow-up to the first cut, which
  had only a small caption): a `PriceReadout` under the price field in the tier
  and product forms — _Base price — what you enter_ beside _Displayed price —
  what visitors pay_, updating as you type, with how much the fee and round-up
  add — and a compact **Base / Displayed** pair on every list row and in the
  tier's swag picker. The field itself is now labelled _Base price (XAF)_. It
  calls the same `feeInclusiveAmount` as the storefront and checkout.
- Revenue reporting is unaffected: `settledRevenue` sums `net_amount`, which
  never included the fee or the round-up.
- FAQ / messages: no FAQ answer quoted a price or the fee percentage
  (checked both locales); the only copy stating the rate was the fee row
  label, updated. `docs/content/PAGES.md`, the frontend guide and the
  content-model skill were updated to the new rule.
