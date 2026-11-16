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

/** What an admin's collector frames say on their strip when they hold no paid pass. */
export const ORGANISER_COLLECTOR_LABEL = "TEAM";

/**
 * Who may use the collector DP frames (ADR 0077): a paid pass holder — or
 * an admin (a row in `organisers`), who runs the event and gets them
 * regardless of a ticket.
 *
 * The paid pass is checked first, so an admin who bought one still gets
 * their own tier on the strip; an admin without one gets "TEAM". Volunteers
 * are not included. Every failure answers "not entitled".
 */
export async function getCollectorAccess(
  userId: string,
): Promise<PaidEntitlement> {
  const paid = await getPaidTicketEntitlement(userId);
  if (paid.entitled) return paid;
  try {
    const { data, error } = await createAdminSupabase()
      .from("organisers")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return NOT_ENTITLED;
    return {
      ...NOT_ENTITLED,
      entitled: true,
      tierName: ORGANISER_COLLECTOR_LABEL,
    };
  } catch (err) {
    console.error("[entitlement] organiser read failed", err);
    return NOT_ENTITLED;
  }
}
