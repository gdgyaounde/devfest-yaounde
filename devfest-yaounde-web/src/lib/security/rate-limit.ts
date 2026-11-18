/**
 * Fixed-window rate limiting, counted in Postgres.
 *
 * Deliberately not an in-process Map: on Vercel each function instance gets
 * its own memory, so an in-process counter caps nothing once traffic spreads
 * across instances. The counter lives in the database via `bump_rate_limit`,
 * which is a single atomic upsert.
 *
 * Covers the surfaces the security skill calls out: discount-code entry and
 * checkout creation.
 */
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/server";
import { clientIp } from "@/lib/pawapay/verify";

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /** Creating a checkout is cheap for us, expensive for PawaPay. */
  checkout: { bucket: "checkout", limit: 10, windowSeconds: 300 },
  /**
   * Pricing a basket. Touches nothing and creates nothing, so this is
   * generous — a buyer changing their mind about quantities re-prices on
   * every click, and that is the feature working, not abuse.
   */
  quote: { bucket: "quote", limit: 60, windowSeconds: 300 },
  /**
   * Discount codes are guessable by design — this is the brute-force fence.
   *
   * **Only a WRONG code advances it** (`consumeOnDiscountFailure`). Counting
   * every submission fenced the wrong thing: an attacker's guesses all fail
   * and so all count either way, while a buyer holding a real code was
   * spending the budget just by re-pricing their own basket, and got locked
   * out of the checkout they were in the middle of.
   */
  discountCode: { bucket: "discount-code", limit: 8, windowSeconds: 300 },
  /** Status polling from the return page. Generous: the page legitimately polls. */
  paymentStatus: { bucket: "payment-status", limit: 120, windowSeconds: 300 },
  /**
   * Door scanning. High enough for a real queue, low enough that a stolen
   * organiser session cannot walk the badge-code space.
   */
  checkIn: { bucket: "check-in", limit: 300, windowSeconds: 300 },
  /**
   * Day-of staff (ADR 0079), per user. Name searches are the tight one: a
   * volunteer looks someone up a few times a minute, while a script walking
   * the alphabet to list every attendee needs hundreds.
   */
  staffSearch: { bucket: "staff-search", limit: 60, windowSeconds: 300 },
  /** "This interests me" (ADR 0086): a tap each, per account. */
  interest: { bucket: "interest", limit: 60, windowSeconds: 300 },
  /** Reservations (ADR 0084), per account: a few tries, not a script. */
  reservation: { bucket: "reservation", limit: 12, windowSeconds: 300 },
  reservationRead: {
    bucket: "reservation-read",
    limit: 60,
    windowSeconds: 300,
  },
  /** Door staff looking reservations up and recording cash (ADR 0084). */
  staffReservation: {
    bucket: "staff-reservation",
    limit: 120,
    windowSeconds: 300,
  },
  staffPerk: { bucket: "staff-perk", limit: 300, windowSeconds: 300 },
  staffOrder: { bucket: "staff-order", limit: 60, windowSeconds: 300 },
  /** Organisers adding or removing volunteers. */
  adminVolunteer: { bucket: "admin-volunteer", limit: 60, windowSeconds: 300 },
  /**
   * Community wall submissions, by IP. There is no account to attribute them
   * to (ADR 0015), so the address is all there is. Five an hour is generous
   * for a person and tedious for a script.
   */
  dpGallery: { bucket: "dp_gallery", limit: 12, windowSeconds: 3600 },
  /**
   * Reporting a wall card, by IP. Cheaper than a submission — a person who
   * spots two bad cards should not wait an hour — still useless as a flood.
   */
  dpGalleryReport: {
    bucket: "dp_gallery_report",
    limit: 8,
    windowSeconds: 300,
  },
  /**
   * The public remaining-tickets counter. Cheap, but a real count query —
   * generous enough for many browsers behind one IP each polling on their
   * own 60s interval, tight enough that a script hammering it gets refused.
   */
  capacityRead: { bucket: "capacity-read", limit: 30, windowSeconds: 60 },
  /**
   * Claiming a ticket. A person tries this once, maybe twice if they mistype
   * something; a script trying every ticket id in an order is what this
   * fences, on top of the token itself already being unguessable.
   */
  ticketClaim: { bucket: "ticket-claim", limit: 10, windowSeconds: 300 },
  /**
   * A holder editing their own ticket's name / size (ADR 0075). A person
   * fixes a typo or two; twenty in five minutes is already generous.
   */
  ticketEdit: { bucket: "ticket-edit", limit: 20, windowSeconds: 300 },
  /**
   * The collector DP frames check (ADR 0077). Read-only and per person; the
   * generator asks once per visit.
   */
  dpCollector: { bucket: "dp-collector", limit: 30, windowSeconds: 300 },
  /** Dashboard writes. Generous for a person, useless for a script. */
  adminWrite: { bucket: "admin-write", limit: 60, windowSeconds: 300 },
  /**
   * Promoting / demoting admins. A privilege-escalation surface: ten changes
   * in ten minutes is far beyond any real reshuffle of a small team, and is
   * exactly what a stolen session churning membership would look like. The
   * fifth change in a window is also flagged (see the role-change handler).
   */
  adminRoleChange: {
    bucket: "admin-role-change",
    limit: 10,
    windowSeconds: 600,
  },
  /** One picture per remaining profile, so this is higher than adminWrite. */
  adminPhoto: { bucket: "admin-photo", limit: 120, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * @param identifier stable per-caller key — a user id when signed in, else IP.
 *                   Prefer the user id: it survives a phone changing network.
 */
export async function rateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.rpc("bump_rate_limit", {
    p_bucket: rule.bucket,
    p_identifier: identifier,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    // Fail OPEN. A database hiccup must not block a paying attendee; the
    // real fences (auth, server-side pricing, the authoritative re-fetch)
    // are all still in place.
    console.warn("[rate-limit] counter unavailable, allowing through", {
      bucket: rule.bucket,
      error: error.message,
    });
    return { allowed: true, count: 0, limit: rule.limit, retryAfterSeconds: 0 };
  }

  const count = Number(data ?? 0);
  return {
    allowed: count <= rule.limit,
    count,
    limit: rule.limit,
    retryAfterSeconds: rule.windowSeconds,
  };
}

/**
 * Charge the brute-force fence for a discount failure, and say whether the
 * caller has now run out of attempts.
 *
 * Call this ONLY once a code has actually been rejected. Order matters: the
 * lookup happens first and is unmetered, the counter moves only on a wrong
 * answer. That still throttles guessing — every guess an attacker makes is
 * wrong, so every guess costs — while leaving a valid code free to re-price
 * as often as the basket changes.
 *
 * @returns true when the caller should be told `rate_limited` instead of
 *          which flavour of wrong their code was.
 */
export async function consumeOnDiscountFailure(
  identifier: string,
): Promise<boolean> {
  const result = await rateLimit(RATE_LIMITS.discountCode, identifier);
  return !result.allowed;
}

/** Identity for rate limiting: user id when we have one, client IP otherwise. */
export function rateLimitIdentity(
  userId: string | null,
  headers: Headers,
): string {
  if (userId) return `user:${userId}`;
  return `ip:${clientIp(headers) ?? "unknown"}`;
}
