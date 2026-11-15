/**
 * GET /api/staff/orders?q=<name or order number> — find a shop order to hand
 * over at the merch table (ADR 0079).
 *
 * Day-of staff only. Only PICKUP orders, and only ones still waiting
 * (`processing`, `ready_for_pickup`) or already handed over (`delivered`, so
 * a second visit is answered rather than "not found"). Shows the buyer's
 * name, the items and the status — no email, no amount, no payment details.
 *
 * Pickup orders are few (one at the time of writing), so they are read in one
 * capped query and matched in code: a short order number is a prefix of a
 * uuid, which PostgREST cannot `ilike` directly.
 */
import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/admin/audit";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import type { StaffOrder } from "@/lib/staff/results";
import {
  fulfilmentMethod,
  matchesOrderQuery,
  MAX_SEARCH_RESULTS,
  MIN_SEARCH_LENGTH,
  orderRef,
} from "@/lib/staff/rules";
import { createAdminSupabase } from "@/lib/supabase/server";

/** Far above any real number of pickup orders; a cap, not a page size. */
const READ_CAP = 1000;

export async function GET(request: NextRequest) {
  const staff = await guardStaff("staffOrder");
  if (staff instanceof Response) return staff;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.replace(/^#/, "").length < MIN_SEARCH_LENGTH) {
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  }

  const supabase = createAdminSupabase();
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, status, fulfilment, order_items(name_snapshot, quantity, variant)",
    )
    .in("status", ["processing", "ready_for_pickup", "delivered"])
    .order("created_at", { ascending: true })
    .limit(READ_CAP);
  if (error) {
    console.error("[staff/orders] read failed", error.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  const pickup = orders.filter(
    (o) => fulfilmentMethod(o.fulfilment) === "pickup",
  );
  const userIds = [...new Set(pickup.map((o) => o.user_id))];
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds)
    : { data: [], error: null };
  if (profileError) {
    console.error("[staff/orders] profiles failed", profileError.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const results: StaffOrder[] = pickup
    .map((o) => ({ order: o, buyerName: nameById.get(o.user_id) ?? null }))
    .filter(({ order, buyerName }) =>
      matchesOrderQuery(q, { id: order.id, buyerName }),
    )
    .slice(0, MAX_SEARCH_RESULTS)
    .map(({ order, buyerName }) => ({
      id: order.id,
      ref: orderRef(order.id),
      buyerName,
      status: order.status,
      items: (order.order_items ?? []).map((item) => ({
        name: item.name_snapshot as { fr: string; en: string } | string,
        quantity: item.quantity,
        variant:
          (item.variant as { size?: string; color?: string } | null) ?? null,
      })),
    }));

  await recordAudit({
    actor: staff.userId,
    action: "staff.order_search",
    after: { role: staff.role, queryLength: q.length, results: results.length },
  });

  return Response.json({ orders: results }, { headers: NO_STORE });
}
