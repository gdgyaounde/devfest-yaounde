/**
 * POST /api/staff/orders/:id/handover — the buyer collected their order at
 * the merch table (ADR 0079).
 *
 * Day-of staff only, PICKUP orders only. `ready_for_pickup` → `delivered`;
 * `processing` goes through `ready_for_pickup` first, so the order keeps a
 * truthful history of lifecycle transitions it already allows. Each step is
 * conditional on the status it read (`.eq("status", from)`), so two tables
 * handing over the same order cannot both succeed — the second gets 409.
 *
 * Broader order changes (shipping, cancelling) stay organiser-only, on
 * `PATCH /api/orders/:id/status`.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/admin/audit";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { logPaymentEvent } from "@/lib/payments/intents";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import { canHandOver, fulfilmentMethod } from "@/lib/staff/rules";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await guardStaff("staffOrder");
  if (staff instanceof Response) return staff;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  }

  const supabase = createAdminSupabase();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, fulfilment")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[staff/handover] read failed", error.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }
  if (!order) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }

  const decision = canHandOver({
    status: order.status,
    method: fulfilmentMethod(order.fulfilment),
  });
  if (!decision.ok) {
    return Response.json(
      { error: decision.reason, status: order.status },
      { status: 409, headers: NO_STORE },
    );
  }

  let from = order.status;
  for (const to of decision.steps) {
    const { data: updated, error: writeError } = await supabase
      .from("orders")
      .update({ status: to })
      .eq("id", id)
      .eq("status", from)
      .select("status")
      .maybeSingle();
    if (writeError) {
      console.error("[staff/handover] write failed", writeError.message);
      return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
    }
    if (!updated) {
      return Response.json(
        { error: "conflict" },
        { status: 409, headers: NO_STORE },
      );
    }
    await logPaymentEvent(null, "order_status_changed", {
      orderId: id,
      from,
      to,
      staffId: staff.userId,
      role: staff.role,
    });
    from = to;
  }

  await recordAudit({
    actor: staff.userId,
    action: "order.handover",
    target: id,
    before: { status: order.status },
    after: { status: "delivered", role: staff.role },
  });

  return Response.json({ status: "delivered" }, { headers: NO_STORE });
}
