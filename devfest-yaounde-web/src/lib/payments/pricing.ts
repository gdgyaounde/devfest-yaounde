/**
 * Server-side pricing. Every total the buyer is charged is produced here,
 * from the catalog, from ids only.
 *
 * The client sends: which tier / which product, how many, which variant, and
 * optionally a discount code. It does not send money, and if it does, the
 * value is dropped on the floor.
 */
import "server-only";
import type {
  AttendeeInput,
  CartLine,
  PricedBasket,
  PricedLine,
} from "@/data/types";
import {
  assertPaymentsOpen,
  assertTicketSalesOpen,
  CURRENCY,
  declaredStock,
  findProduct,
  findTier,
  isPurchasable,
  isValidVariant,
  loadProducts,
  loadTiers,
} from "./catalog";
import { CHECKOUT_ERRORS, CheckoutError } from "./errors";
import { transactionFeeAmount } from "./fees";
import { createAdminSupabase } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/content/settings";

/** Nobody needs 200 hoodies, and an unbounded quantity is a denial-of-wallet. */
const MAX_QUANTITY_PER_LINE = 10;
const MAX_TICKETS_PER_ORDER = 10;

export interface DiscountRow {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  applies_to: "tickets" | "shop" | "both";
  max_redemptions: number | null;
  redeemed_count: number;
  expires_at: string | null;
  active: boolean;
}

/**
 * Looks a code up and validates it against this basket. Throws a
 * `CheckoutError` with a specific code so the screen can say *why* it failed
 * — "expired" and "already used up" are different disappointments.
 */
async function resolveDiscount(
  code: string,
  kind: "tickets" | "shop",
): Promise<DiscountRow> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle<DiscountRow>();

  if (error) throw new CheckoutError(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  if (!data || !data.active)
    throw new CheckoutError(CHECKOUT_ERRORS.DISCOUNT_INVALID);

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new CheckoutError(CHECKOUT_ERRORS.DISCOUNT_EXPIRED);
  }
  if (
    data.max_redemptions !== null &&
    data.redeemed_count >= data.max_redemptions
  ) {
    throw new CheckoutError(CHECKOUT_ERRORS.DISCOUNT_EXHAUSTED);
  }
  if (data.applies_to !== "both" && data.applies_to !== kind) {
    throw new CheckoutError(CHECKOUT_ERRORS.DISCOUNT_NOT_APPLICABLE);
  }
  return data;
}

function applyDiscount(subtotal: number, discount: DiscountRow): number {
  const raw =
    discount.kind === "percent"
      ? Math.floor((subtotal * discount.value) / 100)
      : discount.value;
  // Never below zero, and never a negative charge.
  return Math.min(Math.max(raw, 0), subtotal);
}

/**
 * The one place the transaction fee (PHASE22 §D+) joins the total, and the
 * round-up to the next 50 XAF (PHASE23 §A) with it — both live in
 * `feeInclusiveAmount`. Exported so the ordering below is testable without a
 * database (a real discount lookup needs one); nothing outside this file and
 * the tests calls it.
 *
 * ORDER MATTERS: the discount is computed against the BASE subtotal
 * (unchanged from before the fee existed — a code takes a percentage off
 * what a ticket or product actually costs, not off a fee that has nothing
 * to do with the catalog), and the fee is added ONCE, to what is left
 * after that. Applying it the other way — fee first, discount on the
 * fee-inclusive total — would make a discount also shrink the fee, which
 * is not what "1.5% transaction fee" means.
 *
 * `net` is the base, post-discount amount — what the event actually earns,
 * used for admin revenue reporting (`settledRevenue` already sums
 * `net_amount`, not `charged_amount`, for exactly this reason: a pass-
 * through fee is not real ticket/product revenue). `charged` is what is
 * actually charged via PawaPay and shown everywhere as the total — the fee
 * is real money the buyer pays, so it can never be display-only.
 */
export function finalise(
  lines: PricedLine[],
  discount: DiscountRow | null,
): PricedBasket {
  const subtotal = lines.reduce((sum, line) => sum + line.lineAmount, 0);
  const discountAmount = discount ? applyDiscount(subtotal, discount) : 0;
  const net = subtotal - discountAmount;
  const feeAmount = transactionFeeAmount(net);
  const charged = net + feeAmount;

  return {
    lines,
    subtotal,
    discountCode: discount?.code,
    discountAmount,
    feeAmount,
    charged,
    net,
    currency: CURRENCY,
  };
}

/**
 * Prices a ticket order from the attendee list. The list IS the quantity:
 * three attendees on the Sonnet tier means three Sonnet tickets, which is
 * also what stops "quantity 3, one attendee, one paid ticket" from working.
 */
export async function quoteTickets(
  attendees: AttendeeInput[],
  discountCode?: string,
): Promise<PricedBasket> {
  if (attendees.length === 0) {
    throw new CheckoutError(CHECKOUT_ERRORS.EMPTY_BASKET);
  }
  if (attendees.length > MAX_TICKETS_PER_ORDER) {
    throw new CheckoutError(CHECKOUT_ERRORS.ATTENDEE_COUNT_MISMATCH);
  }

  const tiers = await loadTiers();
  const counts = new Map<string, number>();

  // The per-attendee rules that pricing itself does not care about. They
  // still belong on the paying path: an apparel tier with no size is an
  // order nobody can fulfil.
  for (const attendee of attendees) {
    const tier = findTier(attendee.tierId, tiers);
    if (!tier) throw new CheckoutError(CHECKOUT_ERRORS.UNKNOWN_TIER);
    if (tier.includesApparel && !attendee.apparelSize) {
      throw new CheckoutError(CHECKOUT_ERRORS.APPAREL_SIZE_REQUIRED);
    }
    counts.set(attendee.tierId, (counts.get(attendee.tierId) ?? 0) + 1);
  }

  return quoteTierCounts(
    [...counts].map(([tierId, quantity]) => ({ tierId, quantity })),
    discountCode,
  );
}

/** How many tickets of one tier — the shape pricing actually needs. */
export interface TierCount {
  tierId: string;
  quantity: number;
}

/**
 * Prices tickets from tier counts alone.
 *
 * Split out of `quoteTickets` so the price PREVIEW and the real checkout run
 * the same arithmetic. Two functions that both "work out the ticket total"
 * are two functions that eventually disagree, and the one the buyer is shown
 * disagreeing with the one they are charged is the worst possible pairing.
 *
 * What is deliberately absent is everything about the attendees — names,
 * emails, apparel sizes. None of it moves the total, and a preview is asked
 * for before those are filled in.
 */
export async function quoteTierCounts(
  counts: TierCount[],
  discountCode?: string,
): Promise<PricedBasket> {
  const total = counts.reduce((sum, c) => sum + c.quantity, 0);
  if (counts.length === 0 || total === 0) {
    throw new CheckoutError(CHECKOUT_ERRORS.EMPTY_BASKET);
  }
  if (total > MAX_TICKETS_PER_ORDER) {
    throw new CheckoutError(CHECKOUT_ERRORS.ATTENDEE_COUNT_MISMATCH);
  }

  // The sales cutoff (ADR 0072), before anything else is looked up: after
  // it, no tier is for sale, whatever its own flags say. Checked here and not
  // in the route so the preview and the real checkout cannot disagree.
  assertTicketSalesOpen(new Date(), await loadSettings());

  const tiers = await loadTiers();
  const lines: PricedLine[] = [];

  for (const { tierId, quantity } of counts) {
    if (quantity <= 0) continue;
    const tier = findTier(tierId, tiers);
    if (!tier) throw new CheckoutError(CHECKOUT_ERRORS.UNKNOWN_TIER);
    if (!tier.onSale) throw new CheckoutError(CHECKOUT_ERRORS.TIER_NOT_ON_SALE);
    // `rsvpExternal` is not a display hint. The tier is not sold here at all:
    // the RSVP is delegated to the community platform, which enforces one per
    // person. Without this check a direct POST mints unlimited free tickets
    // with valid badge codes and bypasses that rule entirely.
    if (tier.rsvpExternal) {
      throw new CheckoutError(CHECKOUT_ERRORS.TIER_RSVP_EXTERNAL);
    }
    // Explicit admin flag, independent of `quantityAvailable` — an admin can
    // pull a tier off sale for reasons the capacity counter doesn't know
    // about. Checked first and unconditionally: even a request for zero
    // remaining capacity math should not slip through when this is set.
    if (tier.soldOut) {
      throw new CheckoutError(CHECKOUT_ERRORS.TIER_SOLD_OUT);
    }
    // Optimistic fast-fail only: one order asking for more than the tier ever
    // had. It says nothing about what is still free, because a count taken
    // here would be stale by the time we insert. The binding check is the
    // reservation inside `create_payment_intent` — see intents.ts.
    if (
      tier.quantityAvailable !== undefined &&
      quantity > tier.quantityAvailable
    ) {
      throw new CheckoutError(CHECKOUT_ERRORS.TIER_SOLD_OUT);
    }
    lines.push({
      productId: tier.id,
      name: { fr: tier.name, en: tier.name },
      quantity,
      unitAmount: tier.priceXAF,
      lineAmount: tier.priceXAF * quantity,
    });
  }

  const discount = discountCode
    ? await resolveDiscount(discountCode, "tickets")
    : null;
  return finalise(lines, discount);
}

/** Prices a shop cart. Same rules: ids in, catalog prices out. */
export async function quoteCart(
  cart: CartLine[],
  discountCode?: string,
): Promise<PricedBasket> {
  if (cart.length === 0) throw new CheckoutError(CHECKOUT_ERRORS.EMPTY_BASKET);

  // The shop stops taking payments with the tickets (ADR 0084). Here, and not
  // only in the route, so the price preview and the real checkout agree.
  assertPaymentsOpen(new Date(), await loadSettings());

  const products = await loadProducts();
  const lines: PricedLine[] = [];
  for (const line of cart) {
    const product = findProduct(line.productId, products);
    if (!product) throw new CheckoutError(CHECKOUT_ERRORS.UNKNOWN_PRODUCT);
    if (!isPurchasable(product)) {
      // "venue-only" and "sold-out" are both real states a stale tab can hit.
      throw new CheckoutError(CHECKOUT_ERRORS.PRODUCT_UNAVAILABLE);
    }
    if (!isValidVariant(product, line.variant)) {
      throw new CheckoutError(CHECKOUT_ERRORS.INVALID_VARIANT);
    }
    if (line.quantity < 1 || line.quantity > MAX_QUANTITY_PER_LINE) {
      throw new CheckoutError(CHECKOUT_ERRORS.INVALID_BODY);
    }
    // Optimistic fast-fail, exactly like the tier check above: one order
    // asking for more than this combination ever had. It says nothing about
    // what is still free — a count taken here is stale by the time we insert.
    // The binding check is the reservation in `create_payment_intent`.
    const declared = declaredStock(product.id, line.variant, products);
    if (declared !== undefined && line.quantity > declared) {
      throw new CheckoutError(CHECKOUT_ERRORS.VARIANT_SOLD_OUT);
    }

    lines.push({
      productId: product.id,
      name: product.name,
      quantity: line.quantity,
      unitAmount: product.priceXAF,
      lineAmount: product.priceXAF * line.quantity,
      variant: line.variant,
    });
  }

  const discount = discountCode
    ? await resolveDiscount(discountCode, "shop")
    : null;
  return finalise(lines, discount);
}
