/**
 * GET /api/staff/reservations?q=<reference or name> — find a reservation at
 * the door (ADR 0084).
 *
 * Day-of staff only (organisers and active volunteers). As narrow as the
 * ticket search, and for the same reason — a search box over a list of
 * people is the easiest way to leak it:
 *   - a reference (RES-XXXXXX, read forgivingly) or at least three letters of
 *     a name; pattern characters are stripped; at most eight results;
 *   - name, what was reserved, the cash owed and where it stands — NEVER the
 *     phone or the email;
 *   - its own rate limit, and an audit row per search (the length, not the
 *     text: the audit log is not a second attendee list).
 */
import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/admin/audit";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { normaliseReference } from "@/lib/reservations/rules";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import {
  RESERVATION_COLUMNS,
  toStaffReservations,
} from "@/lib/staff/reservations";
import { cleanNameQuery, MAX_SEARCH_RESULTS } from "@/lib/staff/rules";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const staff = await guardStaff("staffReservation");
  if (staff instanceof Response) return staff;

  const raw = request.nextUrl.searchParams.get("q") ?? "";
  const reference = normaliseReference(raw);
  const name = reference ? null : cleanNameQuery(raw);
  if (!reference && !name)
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);

  const base = createAdminSupabase()
    .from("reservations")
    .select(RESERVATION_COLUMNS);
  const { data, error } = await (
    reference
      ? base.eq("reference", reference)
      : base.ilike("contact_name", `%${name}%`).order("contact_name")
  ).limit(MAX_SEARCH_RESULTS);
  if (error) {
    console.error("[staff/reservations] search failed", error.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  await recordAudit({
    actor: staff.userId,
    action: "staff.reservation_search",
    after: {
      role: staff.role,
      by: reference ? "reference" : "name",
      queryLength: (reference ?? name ?? "").length,
      results: data.length,
    },
  });

  return Response.json(
    { reservations: await toStaffReservations(data) },
    { headers: NO_STORE },
  );
}
