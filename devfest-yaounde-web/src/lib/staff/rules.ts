/**
 * Day-of staff rules (ADR 0079): who counts as a volunteer, what a pass
 * includes at the food and swag tables, how a name search is cleaned, and
 * when a shop order may be handed over.
 *
 * Pure — no database, no clock of its own — so the rules that decide who
 * gets a meal are unit-tested rather than discovered at the table.
 */
import type { RefundStanding } from "@/lib/tickets/check-in";

// ------------------------------------------------------------ membership ---

export type StaffRole = "organiser" | "volunteer";

/** A volunteer row is live until its expiry, and not a second after. */
export function isVolunteerActive(expiresAt: string, now: Date): boolean {
  const end = Date.parse(expiresAt);
  return Number.isFinite(end) && now.getTime() < end;
}

/**
 * When volunteer access ends by default: 23:59 in Yaoundé on the day AFTER
 * the event — long enough for the clean-up and the late merch pickup, short
 * enough that nobody keeps a door scanner for a year.
 *
 * `eventDate` is the admin's "YYYY-MM-DD". Douala is UTC+1 all year (no
 * daylight saving), so the offset is fixed.
 */
export function volunteerExpiry(eventDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  if (!match) throw new Error(`volunteerExpiry: bad event date ${eventDate}`);
  const next = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1),
  );
  return `${next.toISOString().slice(0, 10)}T23:59:00+01:00`;
}

// ----------------------------------------------------------------- perks ---

export type PerkKind = "meal" | "swag";

export type PerkEligibility =
  | { ok: true }
  | { ok: false; reason: "free_pass" | "refunded" | "not_in_pass" };

/**
 * Whether this ticket's pass includes `perk`.
 *
 *   - free pass → nothing (ADR 0074: food and swag are paid perks);
 *   - a resolved refund → nothing; the money went back, so the perks did too
 *     (an OPEN refund request still gets everything — they have paid);
 *   - meal → every paid pass;
 *   - swag → a paid pass that bundles at least one item, or apparel.
 *
 * An unknown tier (deleted since the sale) is treated as NOT included, and
 * the volunteer is told to fetch an organiser.
 */
export function perkEligibility(input: {
  perk: PerkKind;
  tier: {
    priceXAF: number;
    swagProductIds?: string[];
    includesApparel?: boolean;
  } | null;
  refund: RefundStanding | null;
}): PerkEligibility {
  const { perk, tier, refund } = input;
  if (!tier) return { ok: false, reason: "not_in_pass" };
  if (tier.priceXAF <= 0) return { ok: false, reason: "free_pass" };
  if (refund === "refunded") return { ok: false, reason: "refunded" };
  if (perk === "meal") return { ok: true };
  const hasSwag =
    (tier.swagProductIds?.length ?? 0) > 0 || tier.includesApparel === true;
  return hasSwag ? { ok: true } : { ok: false, reason: "not_in_pass" };
}

// ----------------------------------------------------------- name search ---

/** Shortest search that runs — two letters would list half the room. */
export const MIN_SEARCH_LENGTH = 3;
/** Results per search: enough to pick from, too few to page through a list. */
export const MAX_SEARCH_RESULTS = 8;

/**
 * A typed name, cleaned for an `ilike` pattern, or null if too short.
 *
 * Only letters (any script — accents included), digits, spaces, apostrophes,
 * dots and hyphens survive. That drops the pattern characters (`%`, `_`,
 * `*`, `\`) and PostgREST's filter punctuation (`,`, `(`, `)`) in one rule,
 * so a search can never widen itself into "everyone".
 */
export function cleanNameQuery(input: string): string | null {
  const cleaned = input
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s'.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned.replace(/[\s'.-]/g, "").length >= MIN_SEARCH_LENGTH
    ? cleaned
    : null;
}

// ---------------------------------------------------------- merch pickup ---

/** The short order number buyers see on their account page: 8 characters. */
export function orderRef(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * Whether a typed query matches an order — by its short number (with or
 * without a leading "#") or by part of the buyer's name, case- and
 * accent-insensitively.
 */
export function matchesOrderQuery(
  query: string,
  order: { id: string; buyerName: string | null },
): boolean {
  const fold = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const q = fold(query).replace(/^#/, "");
  if (q.length < MIN_SEARCH_LENGTH) return false;
  if (orderRef(order.id).toLowerCase().startsWith(q.replace(/\s/g, ""))) {
    return true;
  }
  return order.buyerName ? fold(order.buyerName).includes(q) : false;
}

export type HandOver =
  | { ok: true; steps: ("ready_for_pickup" | "delivered")[] }
  | {
      ok: false;
      reason: "not_pickup" | "already_handed_over" | "cancelled" | "shipping";
    };

/**
 * May a volunteer hand this order over at the merch table, and through which
 * status steps?
 *
 * Only pickup orders. `processing` goes through `ready_for_pickup` first —
 * both are transitions the order lifecycle already allows — so the history
 * stays truthful instead of skipping a state.
 */
export function canHandOver(order: {
  status: string;
  method: string | null;
}): HandOver {
  if (order.status === "delivered") {
    return { ok: false, reason: "already_handed_over" };
  }
  if (order.status === "cancelled") return { ok: false, reason: "cancelled" };
  if (order.status === "shipped") return { ok: false, reason: "shipping" };
  if (order.method !== "pickup") return { ok: false, reason: "not_pickup" };
  if (order.status === "ready_for_pickup") {
    return { ok: true, steps: ["delivered"] };
  }
  if (order.status === "processing") {
    return { ok: true, steps: ["ready_for_pickup", "delivered"] };
  }
  return { ok: false, reason: "not_pickup" };
}

/** Where a pickup method is recorded: `fulfilment.method` or `.requested.method`. */
export function fulfilmentMethod(fulfilment: unknown): string | null {
  if (!fulfilment || typeof fulfilment !== "object") return null;
  const f = fulfilment as {
    method?: unknown;
    requested?: { method?: unknown };
  };
  if (typeof f.method === "string") return f.method;
  if (typeof f.requested?.method === "string") return f.requested.method;
  return null;
}
