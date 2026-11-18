/**
 * Reservation rules (ADR 0084): what a reservation may contain and what it
 * costs in cash at the venue.
 *
 * Pure — no database, no clock of its own — so what decides who holds which
 * seat, and what they owe at the door, is unit-tested.
 *
 * What it deliberately is NOT: a payment. Prices here are BASE prices (cash
 * at the venue has no online transaction fee), computed from the catalog on
 * the server; the client only says which tier/product and how many.
 */
import { z } from "zod";
import type { Product, TicketTier } from "@/data/types";
import { cashPriceXAF } from "@/lib/payments/fees";
import { APPAREL_SIZES } from "@/lib/tickets/self-edit";

// -------------------------------------------------------------------- limits

/** One reservation may carry at most this many tickets (as at checkout). */
export const MAX_TICKETS = 10;
/** … and this many distinct shop lines. */
export const MAX_ITEM_LINES = 20;
export const MAX_QUANTITY_PER_LINE = 10;
/** Reservations one account may hold at once (cancelled ones don't count). */
export const MAX_ACTIVE_RESERVATIONS = 3;

// ------------------------------------------------------------------- schema

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "invalid id");

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((value) => !hasControlCharacters(value), "invalid characters");

/**
 * A phone people actually reach each other on: digits, optionally with a
 * leading +, spaces, dots or dashes between them. 8–15 digits. Not forced to
 * Cameroon's format — a diaspora number is a perfectly good way to be found.
 */
const phoneSchema = z
  .string()
  .trim()
  .max(24)
  .regex(/^\+?[0-9][0-9 .-]*$/, "invalid phone")
  .refine((value) => {
    const digits = value.replace(/\D/g, "").length;
    return digits >= 8 && digits <= 15;
  }, "invalid phone");

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const reservationSchema = z
  .object({
    contact: z
      .object({
        name: nameSchema,
        phone: phoneSchema,
        email: emailSchema.optional().or(z.literal("")),
      })
      .strict(),
    tickets: z
      .array(
        z
          .object({
            tierId: idSchema,
            name: nameSchema,
            apparelSize: z.enum(APPAREL_SIZES).optional(),
          })
          .strict(),
      )
      .max(MAX_TICKETS)
      .default([]),
    items: z
      .array(
        z
          .object({
            productId: idSchema,
            quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
            variant: z
              .object({
                size: z.string().trim().max(16).optional(),
                color: z.string().trim().max(32).optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(MAX_ITEM_LINES)
      .default([]),
    /**
     * "I understand I pay in cash at the venue." A literal `true`; the FACT
     * only — there is no wording to record, nothing is charged here.
     */
    acceptedCash: z.literal(true),
    locale: z.enum(["fr", "en"]).default("fr"),
  })
  .strict()
  .refine((value) => value.tickets.length + value.items.length > 0, {
    message: "empty reservation",
  });

export type ReservationInput = z.infer<typeof reservationSchema>;

// -------------------------------------------------------------------- errors

export const RESERVATION_ERRORS = {
  NOT_OPEN: "reservations_not_open",
  CLOSED: "reservations_closed",
  EMPTY: "empty_reservation",
  UNKNOWN_TIER: "unknown_tier",
  TIER_NOT_RESERVABLE: "tier_not_reservable",
  TIER_FULL: "tier_full",
  SIZE_REQUIRED: "apparel_size_required",
  UNKNOWN_PRODUCT: "unknown_product",
  PRODUCT_UNAVAILABLE: "product_unavailable",
  INVALID_VARIANT: "invalid_variant",
  TOO_MANY: "too_many_reservations",
} as const;

export type ReservationErrorCode =
  (typeof RESERVATION_ERRORS)[keyof typeof RESERVATION_ERRORS];

export class ReservationError extends Error {
  constructor(
    readonly code: ReservationErrorCode,
    readonly status = 409,
  ) {
    super(code);
  }
}

// --------------------------------------------------------------------- phase

/**
 * Reservations are open between the payments cutoff and the reservations
 * deadline — exactly `salesPhase === "reserving"` (ADR 0084).
 */
export function reservationGate(
  phase: "selling" | "reserving" | "door",
): ReservationErrorCode | null {
  if (phase === "selling") return RESERVATION_ERRORS.NOT_OPEN;
  if (phase === "door") return RESERVATION_ERRORS.CLOSED;
  return null;
}

// ------------------------------------------------------------------- pricing

/** Product statuses that can be reserved (everything except sold out). */
const RESERVABLE_STATUSES = new Set(["pre-order", "in-stock", "venue-only"]);

export interface PricedReservation {
  tickets: { tierId: string; name: string; apparelSize?: string }[];
  items: {
    productId: string;
    quantity: number;
    variant?: { size?: string; color?: string };
  }[];
  /** Whole XAF, BASE prices — what is paid in cash at the venue. */
  totalXaf: number;
  /** `{ tierId: cap | null }` for the tiers asked for, for the database lock. */
  caps: Record<string, number | null>;
}

function validVariant(
  product: Product,
  variant?: { size?: string; color?: string },
): boolean {
  if (!variant || (!variant.size && !variant.color)) {
    return !product.variants?.size?.length;
  }
  if (
    variant.size &&
    !product.variants?.size?.includes(variant.size as never)
  ) {
    return false;
  }
  if (variant.color && !product.variants?.color?.includes(variant.color)) {
    return false;
  }
  return true;
}

/**
 * Check a reservation against the catalog and price it. Throws a
 * `ReservationError` for the first thing wrong; never trusts a price from
 * the client (there is no field for one).
 *
 * Free tiers are refused: the free pass is an RSVP on the community page and
 * is not reserved here. Retired and unpublished tiers/products are refused;
 * a tier flagged sold out is refused. Capacity itself is decided in the
 * database, under a lock (`create_reservation`).
 */
export function priceReservation(
  input: Pick<ReservationInput, "tickets" | "items">,
  tiers: TicketTier[],
  products: Product[],
): PricedReservation {
  if (input.tickets.length + input.items.length === 0) {
    throw new ReservationError(RESERVATION_ERRORS.EMPTY, 400);
  }

  let total = 0;
  const caps: Record<string, number | null> = {};

  for (const ticket of input.tickets) {
    const tier = tiers.find((t) => t.id === ticket.tierId);
    if (!tier) throw new ReservationError(RESERVATION_ERRORS.UNKNOWN_TIER);
    if (
      !tier.onSale ||
      tier.soldOut ||
      tier.rsvpExternal ||
      tier.priceXAF <= 0
    ) {
      throw new ReservationError(RESERVATION_ERRORS.TIER_NOT_RESERVABLE);
    }
    if (tier.includesApparel && !ticket.apparelSize) {
      throw new ReservationError(RESERVATION_ERRORS.SIZE_REQUIRED, 400);
    }
    total += cashPriceXAF(tier);
    caps[tier.id] = tier.quantityAvailable ?? null;
  }

  for (const line of input.items) {
    const product = products.find((p) => p.id === line.productId);
    if (!product)
      throw new ReservationError(RESERVATION_ERRORS.UNKNOWN_PRODUCT);
    if (product.ticketOnly || !RESERVABLE_STATUSES.has(product.status)) {
      throw new ReservationError(RESERVATION_ERRORS.PRODUCT_UNAVAILABLE);
    }
    if (!validVariant(product, line.variant)) {
      throw new ReservationError(RESERVATION_ERRORS.INVALID_VARIANT, 400);
    }
    total += cashPriceXAF(product) * line.quantity;
  }

  return {
    tickets: input.tickets.map((t) => ({
      tierId: t.tierId,
      name: t.name.trim(),
      ...(t.apparelSize ? { apparelSize: t.apparelSize } : {}),
    })),
    items: input.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      ...(i.variant && (i.variant.size || i.variant.color)
        ? { variant: i.variant }
        : {}),
    })),
    totalXaf: total,
    caps,
  };
}

// ----------------------------------------------------------------- reference

/** Crockford base32: no I, L, O or U, so nothing is misread off a screen. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A short reference people quote at the venue: `RES-` + 6 characters. Takes
 * random bytes as an argument so it is deterministic under test; the route
 * passes `crypto.randomBytes`. Collisions (32^6 ≈ 1 billion) are retried by
 * the caller when the database reports `reference_taken`.
 */
export function referenceFrom(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `RES-${out}`;
}

/** Normalise what a volunteer types: case, spaces and the dash don't matter. */
export function normaliseReference(input: string): string | null {
  const compact = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/^RES/, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (compact.length !== 6) return null;
  const ref = `RES-${compact}`;
  return /^RES-[0-9A-HJKMNP-TV-Z]{6}$/.test(ref) ? ref : null;
}
