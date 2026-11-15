/**
 * GET /api/account/tickets — the "My Tickets" dashboard feed (PAGES.md §7).
 *
 * A01 is enforced twice on purpose: every query runs through the SESSION
 * client (so RLS filters to `auth.uid()`), and there is no id parameter to
 * tamper with in the first place. Changing a number in the URL gets you
 * nowhere because there is no number in the URL.
 *
 * ## Why this returns more than the `tickets` row
 *
 * A ticket row holds a tier SLUG and no price. On its own that renders as
 * "SONNET" and nothing else — which tells the person who paid neither what
 * they bought nor what it cost them. So two things are joined on:
 *
 *   - the CATALOG, for the tier's real name, its sub-title and what it
 *     includes. Resolved server-side rather than shipping the catalog to the
 *     browser, so the page and the receipt email describe a ticket the same
 *     way, from one source.
 *   - the PAYMENT INTENT, for what was actually charged — the unit price at
 *     the time, any discount, and the order total. Read through the session
 *     client as well, so `own intents readable` is what permits it; a buyer
 *     still cannot see anybody else's order.
 *
 * The intent is the record of what happened, not the catalog: a tier whose
 * price changes later must not rewrite what someone was charged in September.
 */
import { findTier, loadTiers } from "@/lib/payments/catalog";
import type { PricedLine } from "@/data/types";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import {
  createAdminSupabase,
  createServerSupabase,
  currentUser,
} from "@/lib/supabase/server";
import { loadSettings } from "@/lib/content/settings";
import {
  BLOCKING_REFUND_STATUSES,
  refundReferencesFor,
  ticketLock,
} from "@/lib/tickets/self-edit";

interface IntentSummary {
  deposit_id: string;
  currency: string;
  discount_code: string | null;
  discount_amount: number;
  charged_amount: number;
  /** Base, post-discount, pre-fee — `charged_amount - net_amount` is the fee. */
  net_amount: number;
  line_items: PricedLine[];
  activated_at: string | null;
  created_at: string;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return errorResponse(CHECKOUT_ERRORS.UNAUTHENTICATED, 401);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, deposit_id, tier_id, attendee_name, attendee_email, apparel_size, badge_code, checked_in_at, created_at, is_self",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[account/tickets] query failed", error);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  const tickets = data ?? [];
  if (tickets.length === 0) return Response.json({ tickets: [] });

  const depositIds = [...new Set(tickets.map((t) => t.deposit_id))];
  /*
   * Which of these tickets are frozen by a refund request (ADR 0075), so the
   * screen can say why "Edit" is not offered. `reference` is free text, so
   * every identifier each ticket has is matched, case-insensitively.
   */
  const refundRefs = [
    ...new Set(
      tickets.flatMap((t) =>
        refundReferencesFor(t).flatMap((r) => [
          r,
          r.toUpperCase(),
          r.toLowerCase(),
        ]),
      ),
    ),
  ];
  const [tiers, intents, settings, refunds] = await Promise.all([
    loadTiers(),
    supabase
      .from("payment_intents")
      .select(
        "deposit_id, currency, discount_code, discount_amount, charged_amount, net_amount, line_items, activated_at, created_at",
      )
      .in("deposit_id", depositIds),
    loadSettings(),
    createAdminSupabase()
      .from("refund_requests")
      .select("reference")
      .eq("kind", "tickets")
      .in("status", [...BLOCKING_REFUND_STATUSES])
      .in("reference", refundRefs),
  ]);
  const frozenRefs = new Set(
    (refunds.data ?? []).map((r) => r.reference.toLowerCase()),
  );
  const now = new Date();

  // A missing intent is not fatal. The ticket is real and its badge code is
  // what gets someone through the door — showing it without the price beats
  // failing the whole page over a receipt detail.
  if (intents.error) {
    console.warn("[account/tickets] intents unreadable", intents.error.message);
  }
  const byDeposit = new Map<string, IntentSummary>(
    ((intents.data as IntentSummary[] | null) ?? []).map((row) => [
      row.deposit_id,
      row,
    ]),
  );

  return Response.json({
    tickets: tickets.map((ticket) => {
      const tier = findTier(ticket.tier_id, tiers);
      const intent = byDeposit.get(ticket.deposit_id);
      const line = intent?.line_items?.find(
        (item) => item.productId === ticket.tier_id,
      );

      return {
        id: ticket.id,
        attendeeName: ticket.attendee_name,
        attendeeEmail: ticket.attendee_email,
        apparelSize: ticket.apparel_size,
        badgeCode: ticket.badge_code,
        checkedInAt: ticket.checked_in_at,
        createdAt: ticket.created_at,
        isSelf: ticket.is_self,
        /** Why it cannot be edited right now, or null (ADR 0075). */
        lock: ticketLock({
          now,
          settings,
          checkedInAt: ticket.checked_in_at,
          hasBlockingRefund: refundReferencesFor(ticket).some((r) =>
            frozenRefs.has(r.toLowerCase()),
          ),
        }),
        tier: {
          id: ticket.tier_id,
          // Falls back to the slug for a tier retired from the catalog. An
          // old ticket must stay readable even when its tier is gone.
          name: tier?.name ?? ticket.tier_id.toUpperCase(),
          label: tier?.label ?? null,
          description: tier?.description ?? null,
          perks: tier?.perks?.map((perk) => perk.label) ?? [],
          includesApparel: tier?.includesApparel ?? false,
        },
        /** What this one ticket cost, as charged. Null if unresolvable. */
        unitAmount: line?.unitAmount ?? null,
        order: intent
          ? {
              depositId: intent.deposit_id,
              currency: intent.currency,
              discountCode: intent.discount_code,
              discountAmount: intent.discount_amount,
              // The 1.5% transaction fee, itemised the same way the
              // discount already is — never folded silently into the total.
              feeAmount: intent.charged_amount - intent.net_amount,
              chargedAmount: intent.charged_amount,
              paidAt: intent.activated_at ?? intent.created_at,
            }
          : null,
      };
    }),
  });
}
