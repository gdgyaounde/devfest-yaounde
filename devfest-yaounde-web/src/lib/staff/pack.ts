/**
 * What a ticket's pack offers, as the door shows it (ADR 0091): so the
 * volunteer who scans a pass can tell the attendee what they are entitled to
 * (and send them to the right table) without opening anything else.
 *
 * Pure and client-safe: the route reads the tier, the products and the refund
 * standing, this decides what is shown. The rule for what a pass includes is
 * the SAME one the meal and swag tables enforce (`perkEligibility`), so the
 * door can never promise what a table will refuse.
 */
import { perkEligibility } from "@/lib/staff/rules";
import type { RefundStanding } from "@/lib/tickets/check-in";

type Localized = { fr: string; en: string };

export interface Pack {
  /** Entry is always included, whatever the pass. */
  entry: true;
  meal: boolean;
  swag: boolean;
  /** The perks the pass advertises ("Lunch and coffee breaks", …). */
  perks: Localized[];
  /** What goes in the bag, when swag is included. */
  items: Localized[];
  /**
   * Present only when the pass includes a shirt: the size on file, or null
   * (so the screen can tell "no shirt" from "shirt, but no size yet").
   */
  apparelSize?: string | null;
  /** Why meal/swag are off, when they are: a free pass or a paid-back ticket. */
  reason?: "free_pass" | "refunded" | "not_in_pass";
}

export function buildPack(input: {
  tier: {
    priceXAF: number;
    perks?: { label: Localized }[];
    swagProductIds?: string[];
    includesApparel?: boolean;
  } | null;
  products: { id: string; name: Localized }[];
  refund: RefundStanding | null;
  apparelSize: string | null;
}): Pack {
  const { tier, products, refund, apparelSize } = input;
  const meal = perkEligibility({ perk: "meal", tier, refund });
  const swag = perkEligibility({ perk: "swag", tier, refund });
  const byId = new Map(products.map((p) => [p.id, p.name]));
  const swagOk = swag.ok;
  return {
    entry: true,
    meal: meal.ok,
    swag: swagOk,
    // A paid-back ticket is a free pass now: it carries no advertised perks.
    perks: meal.ok ? (tier?.perks ?? []).map((p) => p.label) : [],
    items: swagOk
      ? (tier?.swagProductIds ?? [])
          .map((id) => byId.get(id))
          .filter((n): n is Localized => Boolean(n))
      : [],
    ...(swagOk && tier?.includesApparel ? { apparelSize } : {}),
    ...(!meal.ok ? { reason: meal.reason } : {}),
  };
}
