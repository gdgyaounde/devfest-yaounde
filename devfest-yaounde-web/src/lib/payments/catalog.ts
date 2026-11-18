/**
 * The catalog.
 *
 * This is the ONLY place a price comes from. Nothing in a request body is
 * ever treated as a price — a client that sends `priceXAF: 1` gets charged
 * the real amount, because the real amount is looked up here by id.
 *
 * Live data comes from the editorial store (ADR 0031). The JSON files are
 * the fallback until a collection is published from the dashboard. The
 * sync helpers below read the files so unit tests do not need a database;
 * checkout always goes through `loadTiers` / `loadProducts`.
 */
import ticketTiersJson from "@/data/ticket-tiers.json";
import productsJson from "@/data/products.json";
import type { Product, ProductStatus, TicketTier } from "@/data/types";
import { getProducts, getTiers } from "@/lib/content/store";
import type { TicketingSettings } from "@/lib/admin/shape";
import { ticketSalesOpen } from "@/lib/event";
import { CHECKOUT_ERRORS, CheckoutError } from "./errors";

export const CURRENCY = "XAF" as const;
/** ISO-3166 alpha-3, required by PawaPay's Payment Page. */
export const COUNTRY = "CMR" as const;

const fileTiers = ticketTiersJson as TicketTier[];
const fileProducts = productsJson as Product[];

export async function loadTiers(): Promise<TicketTier[]> {
  return getTiers();
}

export async function loadProducts(): Promise<Product[]> {
  return getProducts();
}

/** Tiers a buyer may pick right now. */
export function sellableTiers(list: TicketTier[] = fileTiers): TicketTier[] {
  return list.filter((tier) => tier.onSale);
}

/** Every tier, including retired ones — past tickets must stay resolvable. */
export function findTier(
  id: string,
  list: TicketTier[] = fileTiers,
): TicketTier | undefined {
  return list.find((tier) => tier.id === id);
}

export function allProducts(list: Product[] = fileProducts): Product[] {
  return list;
}

export function findProduct(
  id: string,
  list: Product[] = fileProducts,
): Product | undefined {
  return list.find((product) => product.id === id);
}

/** Statuses that can actually go through checkout. */
const PURCHASABLE: ReadonlySet<ProductStatus> = new Set([
  "pre-order",
  "in-stock",
]);

/**
 * Refuses a ticket purchase after the sales cutoff (ADR 0072).
 *
 * Called from `quoteTierCounts`, which BOTH the price preview and the real
 * ticket checkout go through — so a stale tab, a hand-written POST and the
 * on-page button all hit the same wall, and the UI's "Sales closed" state is
 * a courtesy on top of this rather than the enforcement.
 *
 * Only tickets. Ticket-only products ride along with a ticket and are never
 * sold alone (`isPurchasable` below), so they close with it. The shop closes
 * too, through `assertPaymentsOpen` below (ADR 0084).
 *
 * Pure, `now` and `settings` arguments, so the boundary is unit-tested
 * without a database.
 */
export function assertTicketSalesOpen(
  now: Date,
  settings: { ticketing: Pick<TicketingSettings, "salesCloseAt"> },
): void {
  if (!ticketSalesOpen(now, settings)) {
    throw new CheckoutError(CHECKOUT_ERRORS.TICKET_SALES_CLOSED, 409);
  }
}

/**
 * Refuses ANY new payment — tickets or shop — once payments have closed
 * (ADR 0084): from `salesCloseAt` on nothing is paid on the platform; people
 * reserve and pay cash at the venue.
 *
 * Called from `quoteCart` (the shop's preview AND checkout), and again in
 * `startCheckout` — the one function that creates a payment intent for either
 * kind — so a stale tab, a hand-written POST and any future route all hit the
 * same wall. Deliberately NOT called from the PawaPay callback or the status
 * poller: a payment started before the cutoff must still be able to finish.
 */
export function assertPaymentsOpen(
  now: Date,
  settings: { ticketing: Pick<TicketingSettings, "salesCloseAt"> },
): void {
  if (!ticketSalesOpen(now, settings)) {
    throw new CheckoutError(CHECKOUT_ERRORS.PAYMENTS_CLOSED, 409);
  }
}

export function isPurchasable(product: Product): boolean {
  // A ticket-only product is never sold alone, whatever its status says.
  // `loadProducts()` already leaves it out; this keeps the rule true even for
  // a caller that hands `findProduct` an unfiltered list.
  if (product.ticketOnly) return false;
  return PURCHASABLE.has(product.status);
}

/**
 * A variant choice is valid only if the product declares that dimension and
 * lists that exact value. Products with no variants accept no variant.
 */
export function isValidVariant(
  product: Product,
  variant?: { size?: string; color?: string },
): boolean {
  if (!variant || (!variant.size && !variant.color)) {
    // A product that offers sizes must have one picked.
    return !product.variants?.size?.length;
  }
  if (variant.size) {
    const sizes = product.variants?.size;
    if (!sizes?.includes(variant.size as never)) return false;
  }
  if (variant.color) {
    const colors = product.variants?.color;
    if (!colors?.includes(variant.color)) return false;
  }
  return true;
}

/**
 * Capacity per tier, for the reservation check in `create_payment_intent`.
 * A tier with no `quantityAvailable` is omitted, which the SQL reads as
 * unlimited. Capacity is declared on the tier; the database only counts
 * against it. An organiser changes the number by publishing the collection.
 */
export function tierCapacities(
  list: TicketTier[] = fileTiers,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tier of list) {
    if (tier.quantityAvailable !== undefined) {
      out[tier.id] = tier.quantityAvailable;
    }
  }
  return out;
}

/**
 * How long a pending checkout holds its seats and its discount redemption.
 * Long enough to finish a Mobile Money prompt on a slow network, short
 * enough that an abandoned tab does not sit on the last ticket all day.
 */
export const RESERVATION_WINDOW_SECONDS = 1800;

/**
 * Per-variant stock (G12).
 *
 * Same split as ticket tiers: the number is declared in `products.json`, and
 * the database counts what has actually been sold against it. A product with
 * no `stock` entry, or a combination absent from it, is unlimited.
 */

/**
 * The key a variant is counted under. Deterministic and shared by the JSON,
 * the SQL and the UI — two spellings of the same combination would silently
 * split one stock figure in half.
 */
export function variantKey(
  productId: string,
  variant?: { size?: string; color?: string },
): string {
  return `${productId}|${variant?.size ?? ""}|${variant?.color ?? ""}`;
}

/** Declared stock for every capped combination, keyed for the reservation. */
export function variantCapacities(
  list: Product[] = fileProducts,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const product of list) {
    for (const row of product.stock ?? []) {
      out[variantKey(product.id, row)] = row.quantity;
    }
  }
  return out;
}

/** What the catalog says about one combination. `undefined` = unlimited. */
export function declaredStock(
  productId: string,
  variant?: { size?: string; color?: string },
  list: Product[] = fileProducts,
): number | undefined {
  const product = findProduct(productId, list);
  const row = product?.stock?.find(
    (s) =>
      (s.size ?? "") === (variant?.size ?? "") &&
      (s.color ?? "") === (variant?.color ?? ""),
  );
  return row?.quantity;
}
