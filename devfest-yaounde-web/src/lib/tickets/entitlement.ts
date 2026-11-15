import "server-only";
import { loadTiers } from "@/lib/payments/catalog";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  NOT_ENTITLED,
  paidEntitlementFrom,
  type PaidEntitlement,
} from "./entitlement-rule";

/**
 * Does this user hold a paid pass of their own? (ADR 0077)
 *
 * The one place the site answers that, server-side, for any perk it can
 * gate — the collector DP frames and their wall saves today. The rule itself
 * is `paidEntitlementFrom` (pure, unit-tested); this only reads the rows.
 *
 * Read with the admin client, filtered to `user_id = userId` — the caller
 * passes the id of the SIGNED-IN user it got from `currentUser()`, never an
 * id from a request. Any read failure answers "not entitled": a perk must
 * fail closed.
 */
export async function getPaidTicketEntitlement(
  userId: string,
): Promise<PaidEntitlement> {
  try {
    const db = createAdminSupabase();
    const { data: tickets, error } = await db
      .from("tickets")
      .select("id, tier_id, badge_code, deposit_id, is_self, claimed_at")
      .eq("user_id", userId);
    if (error || !tickets?.length) return NOT_ENTITLED;

    const refs = [
      ...new Set(
        tickets.flatMap((t) =>
          [t.id, t.badge_code, t.deposit_id].flatMap((r) => [
            r,
            r.toUpperCase(),
            r.toLowerCase(),
          ]),
        ),
      ),
    ];
    const [tiers, refunds] = await Promise.all([
      loadTiers(),
      db
        .from("refund_requests")
        .select("reference")
        .eq("kind", "tickets")
        .eq("status", "resolved")
        .in("reference", refs),
    ]);
    if (refunds.error) return NOT_ENTITLED;

    return paidEntitlementFrom(
      tickets,
      tiers,
      new Set((refunds.data ?? []).map((r) => r.reference.toLowerCase())),
    );
  } catch (err) {
    console.error("[entitlement] read failed", err);
    return NOT_ENTITLED;
  }
}
