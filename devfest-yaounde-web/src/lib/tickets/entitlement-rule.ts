/**
 * Who holds a PAID pass, for perks the site can actually gate — the
 * collector DP frames first (ADR 0077). Pure; `entitlement.ts` feeds it.
 *
 * A ticket counts when ALL of these hold:
 *   - it is on the user's account (`user_id` = them — the caller filters);
 *   - it is THEIRS: `is_self`, or claimed into their account (`claimed_at`).
 *     A buyer's unclaimed tickets for friends do not count — otherwise one
 *     purchase for five friends unlocks the frames for the buyer five times
 *     over while the friends get nothing. A buyer who ALSO bought for
 *     themselves qualifies through that ticket;
 *   - its tier costs money (`priceXAF > 0`): Sonnet, Opus, Fable, Mythos.
 *     Haikyu is free and RSVP'd on Bevy, so it has no ticket row anyway;
 *   - no GRANTED refund matches it (status `resolved`, on the ticket id,
 *     badge code or deposit id — `reference` is free text).
 *
 * The highest-priced qualifying tier is reported, for the ticket-stub serial.
 */
export interface EntitlementTicket {
  id: string;
  tier_id: string;
  badge_code: string;
  deposit_id: string;
  is_self: boolean | null;
  claimed_at: string | null;
}

export interface PaidEntitlement {
  entitled: boolean;
  tierId: string | null;
  tierName: string | null;
}

export const NOT_ENTITLED: PaidEntitlement = {
  entitled: false,
  tierId: null,
  tierName: null,
};

export function paidEntitlementFrom(
  tickets: EntitlementTicket[],
  tiers: { id: string; name: string; priceXAF: number }[],
  refundedReferences: Set<string>,
): PaidEntitlement {
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  let best: { id: string; name: string; priceXAF: number } | null = null;
  for (const ticket of tickets) {
    if (!ticket.is_self && !ticket.claimed_at) continue;
    const tier = tierById.get(ticket.tier_id);
    if (!tier || tier.priceXAF <= 0) continue;
    const refunded = [ticket.id, ticket.badge_code, ticket.deposit_id].some(
      (ref) => refundedReferences.has(ref.toLowerCase()),
    );
    if (refunded) continue;
    if (!best || tier.priceXAF > best.priceXAF) best = tier;
  }
  return best
    ? { entitled: true, tierId: best.id, tierName: best.name.toUpperCase() }
    : NOT_ENTITLED;
}
