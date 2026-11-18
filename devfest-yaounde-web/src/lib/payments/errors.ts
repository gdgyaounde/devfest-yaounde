/**
 * Checkout error codes.
 *
 * Routes return a stable `code`, never a prose message — the screens map the
 * code to copy through next-intl, so both languages stay in step and no
 * internal detail leaks into a response (A05: no stack traces in production).
 *
 * Every code here has a matching key under `errors.checkout.*` in
 * messages/fr.json and messages/en.json.
 */
export const CHECKOUT_ERRORS = {
  UNAUTHENTICATED: "unauthenticated",
  INVALID_BODY: "invalid_body",
  RATE_LIMITED: "rate_limited",
  UNKNOWN_TIER: "unknown_tier",
  TIER_NOT_ON_SALE: "tier_not_on_sale",
  TIER_RSVP_EXTERNAL: "tier_rsvp_external",
  TIER_SOLD_OUT: "tier_sold_out",
  /** Past `ticketing.salesCloseAt` (ADR 0072): no more ticket sales. */
  TICKET_SALES_CLOSED: "ticket_sales_closed",
  /**
   * Past `ticketing.salesCloseAt` (ADR 0084): NO payment of any kind — shop
   * included — passes through the platform. People reserve instead.
   */
  PAYMENTS_CLOSED: "payments_closed",
  UNKNOWN_PRODUCT: "unknown_product",
  PRODUCT_UNAVAILABLE: "product_unavailable",
  INVALID_VARIANT: "invalid_variant",
  VARIANT_SOLD_OUT: "variant_sold_out",
  APPAREL_SIZE_REQUIRED: "apparel_size_required",
  ATTENDEE_COUNT_MISMATCH: "attendee_count_mismatch",
  EMPTY_BASKET: "empty_basket",
  TERMS_NOT_ACCEPTED: "terms_not_accepted",
  DISCOUNT_INVALID: "discount_invalid",
  DISCOUNT_EXPIRED: "discount_expired",
  DISCOUNT_EXHAUSTED: "discount_exhausted",
  DISCOUNT_NOT_APPLICABLE: "discount_not_applicable",
  PAYMENT_PAGE_FAILED: "payment_page_failed",
  SERVER_ERROR: "server_error",
} as const;

export type CheckoutErrorCode =
  (typeof CHECKOUT_ERRORS)[keyof typeof CHECKOUT_ERRORS];

/**
 * The verdicts that mean "that code did not work".
 *
 * These are what the brute-force fence charges for — a wrong guess, of any
 * flavour. Kept as a set rather than a `startsWith("discount_")` test so
 * adding a code has to be a decision about whether it counts as a guess.
 */
const DISCOUNT_FAILURES = new Set<CheckoutErrorCode>([
  CHECKOUT_ERRORS.DISCOUNT_INVALID,
  CHECKOUT_ERRORS.DISCOUNT_EXPIRED,
  CHECKOUT_ERRORS.DISCOUNT_EXHAUSTED,
  CHECKOUT_ERRORS.DISCOUNT_NOT_APPLICABLE,
]);

export function isDiscountFailure(code: CheckoutErrorCode): boolean {
  return DISCOUNT_FAILURES.has(code);
}

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  readonly status: number;

  constructor(code: CheckoutErrorCode, status = 400) {
    super(code);
    this.name = "CheckoutError";
    this.code = code;
    this.status = status;
  }
}

/** Uniform failure envelope. Deliberately carries no internal detail. */
export function errorResponse(
  code: CheckoutErrorCode,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error: code, ...extra }, { status });
}
