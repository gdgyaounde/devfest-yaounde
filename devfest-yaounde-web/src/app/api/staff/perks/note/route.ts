/**
 * POST /api/staff/perks/note — write down what a swag bag was missing (ADR 0092).
 *
 * Body: `{ ticketId, note }`. A note of "" clears it. Staff only. Kept off the
 * main swag route on purpose: the `swag_note` column arrives with migration
 * 0040, and the swag table itself must keep working before it is applied.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/admin/audit";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import { cleanNote, NOTE_MAX } from "@/lib/staff/speakers";
import { createAdminSupabase } from "@/lib/supabase/server";

const bodySchema = z
  .object({ ticketId: z.string().uuid(), note: z.string().max(NOTE_MAX) })
  .strict();

export async function POST(request: NextRequest) {
  if (
    !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
  ) {
    return Response.json(
      { error: "cross_origin" },
      { status: 403, headers: NO_STORE },
    );
  }
  const staff = await guardStaff("staffSearch");
  if (staff instanceof Response) return staff;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);

  const note = cleanNote(parsed.data.note);
  const { data, error } = await createAdminSupabase()
    .from("tickets")
    .update({ swag_note: note })
    .eq("id", parsed.data.ticketId)
    .select("id")
    .maybeSingle();
  if (error) {
    // Includes "column swag_note does not exist" before migration 0040.
    console.error("[staff/perks/note] save failed", error.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 503);
  }
  if (!data) return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 404);
  await recordAudit({
    actor: staff.userId,
    action: "swag.note",
    target: parsed.data.ticketId,
    after: { cleared: note === null },
  });
  return Response.json({ ok: true, note }, { headers: NO_STORE });
}
