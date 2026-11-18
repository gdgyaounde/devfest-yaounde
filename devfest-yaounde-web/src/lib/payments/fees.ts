/**
 * The transaction fee — 1.5% added on top of every price a visitor or buyer
 * actually pays, tickets and shop alike, then rounded UP to the next 50 XAF
 * (PHASE23 §A, ADR 0068).
 *
 * Deliberately NOT `server-only`. This is pure arithmetic on a number
 * already public (a tier or product's listed price), and it has to run in
 * two places that must never disagree: the server's real pricing
 * (`pricing.ts`'s `finalise()`, which is what gets charged) and the browse-
 * time "sticker price" shown on a tier or product card, before a basket or
 * a discount exists at all. One shared function, imported by both, is what
 * makes "the buyer never sees one number and is charged another" possible
 * to guarantee rather than merely intend.
 *
 * BASE PRICES ARE THE STORED SOURCE OF TRUTH. `tier.priceXAF` /
 * `product.priceXAF` — what an admin types into the dashboard — is never
 * rewritten to include the fee. It is computed at render/checkout time,
 * every time, from here. That is what makes the fee apply automatically to
 * every existing tier and product, and every future price an admin sets,
 * with no per-item migration.
 */

/** 1.5%, expressed as an exact integer ratio so the one multiply that
 *  matters stays in integer arithmetic — see `feeInclusiveAmount`. */
const FEE_NUMERATOR = 1015;
const FEE_DENOMINATOR = 1000;

/** Every fee-inclusive price is rounded UP to a multiple of this (PHASE23 §A). */
export const PRICE_ROUNDING_STEP_XAF = 50;

/** For copy that states the rate rather than computing with it. */
export const TRANSACTION_FEE_RATE = 0.015;

/**
 * `base` with the 1.5% fee added, rounded UP to the next multiple of 50 XAF:
 *
 *     ceil((base * 1.015) / 50) * 50
 *
 * One ceiling, no branch. A figure that already lands on a multiple of 50
 * (10000 → 10150) is left alone because the ceiling has nothing to do; the
 * rest go up (2000 → 2030 → 2050, 5000 → 5075 → 5100). This SUPERSEDES the
 * earlier "nearest whole franc, half up" rule (ADR 0063, amended by 0068) —
 * every amount a buyer sees or is charged is now a multiple of 50, which
 * is what Mobile Money amounts are actually quoted in.
 *
 * The multiply is kept in integer space (`base * 1015`, exact for any
 * integer `base` far below Number.MAX_SAFE_INTEGER) and the single division
 * is by the integer 50 000 — so a figure that is mathematically an exact
 * multiple of 50 divides to an exact integer and can never be nudged past
 * it by float drift into paying an extra 50. (Checked against BigInt
 * arithmetic for every base from 0 to 2 000 000.)
 *
 * `0` stays `0`: a free item never becomes a 50 XAF one.
 */
export function feeInclusiveAmount(base: number): number {
  return (
    Math.ceil(
      (base * FEE_NUMERATOR) / (FEE_DENOMINATOR * PRICE_ROUNDING_STEP_XAF),
    ) * PRICE_ROUNDING_STEP_XAF
  );
}

/**
 * The fee line itself — everything the buyer pays on top of `base`: the 1.5%
 * AND the round-up to the next 50. It is deliberately defined as the
 * difference rather than computed separately, so `base + fee` is always
 * exactly `feeInclusiveAmount(base)` and the itemised rows in a summary can
 * never add up to a different total than the one charged.
 */
export function transactionFeeAmount(base: number): number {
  return feeInclusiveAmount(base) - base;
}

/**
 * What a tier costs in CASH at the venue (ADR 0084): its `venuePriceXAF` if
 * the organisers set one, else its base price. No online fee applies. Used by
 * reservations, and by every page once payments have closed.
 */
export function cashPriceXAF(tier: {
  priceXAF: number;
  venuePriceXAF?: number;
}): number {
  return tier.venuePriceXAF ?? tier.priceXAF;
}
