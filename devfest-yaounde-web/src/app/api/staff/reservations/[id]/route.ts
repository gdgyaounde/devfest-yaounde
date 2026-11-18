/**
 * POST /api/staff/reservations/:id — record cash and check in (ADR 0084).
 *
 * Body: `{ action: "cash" | "check_in" | "cash_and_check_in" }`.
 *
 * Day-of staff only. The database functions row-lock the reservation, so two
 * phones cannot both record the same cash or both check the person in; the
 * second is told when it was already done. "Already done" is a 200 with the
 * time, like "already checked in" at the door.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/admin/audit";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import type { ReservationDoorResult } from "@/lib/staff/results";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  RESERVATION_COLUMNS,
  toStaffReservations,
} from "@/lib/staff/reservations";

const bodySchema = z
  .object({ action: z.enum(["cash", "check_in", "cash_and_check_in"]) })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await guardStaff("staffReservation");
  if (staff instanceof Response) return staff;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  const { action } = parsed.data;

  const supabase = createAdminSupabase();
  const steps: ("cash" | "check_in")[] =
    action === "cash_and_check_in" ? ["cash", "check_in"] : [action];
  const outcomes: Record<string, string> = {};

  for (const step of steps) {
    const rpc =
      step === "cash"
        ? await supabase.rpc("set_reservation_cash", {
            p_id: id,
            p_actor: staff.userId,
          })
        : await supabase.rpc("check_in_reservation", { p_id: id });
    if (rpc.error) {
      console.error("[staff/reservations] rpc failed", rpc.error.message);
      return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
    }
    const status = (rpc.data as { status: string }).status;
    outcomes[step] = status;
    if (status === "not_found" || status === "cancelled") {
      return Response.json(
        {
          status: status === "cancelled" ? "cancelled" : "not_found",
        } satisfies ReservationDoorResult,
        { status: status === "cancelled" ? 200 : 404, headers: NO_STORE },
      );
    }
  }

  const { data } = await supabase
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    return Response.json(
      { status: "not_found" } satisfies ReservationDoorResult,
      {
        status: 404,
        headers: NO_STORE,
      },
    );
  }

  await recordAudit({
    actor: staff.userId,
    action: `reservation.${action}`,
    target: id,
    after: { role: staff.role, outcomes },
  });

  const [reservation] = await toStaffReservations([data]);
  return Response.json(
    { status: "ok", reservation } satisfies ReservationDoorResult,
    { headers: NO_STORE },
  );
}
