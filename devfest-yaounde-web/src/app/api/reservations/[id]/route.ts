/**
 * PATCH /api/reservations/:id — `{ action: "cancel" }` (ADR 0084).
 *
 * The OWNER cancels their own reservation, while reservations are still
 * open. `cancel_reservation` re-checks ownership and that it is still
 * 'reserved' under a row lock; once cash has been received it is no longer a
 * button but a conversation with an organiser.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/admin/audit";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { loadSettings } from "@/lib/content/settings";
import { salesPhase } from "@/lib/event";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitIdentity,
} from "@/lib/security/rate-limit";
import { createAdminSupabase, currentUser } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const fail = (error: string, status: number) =>
  Response.json({ error }, { status, headers: NO_STORE });

const bodySchema = z.object({ action: z.literal("cancel") }).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (
    !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
  ) {
    return fail("cross_origin", 403);
  }
  const user = await currentUser();
  if (!user) return fail("unauthenticated", 401);
  const limit = await rateLimit(
    RATE_LIMITS.reservation,
    rateLimitIdentity(user.id, request.headers),
  );
  if (!limit.allowed) return fail("rate_limited", 429);

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body", 400);
  }
  if (!bodySchema.safeParse(body).success) return fail("invalid_body", 400);

  // Reservations over means over: after the deadline it is for organisers.
  const phase = salesPhase(new Date(), await loadSettings());
  if (phase === "door") return fail("reservations_closed", 409);

  const { data, error } = await createAdminSupabase().rpc(
    "cancel_reservation",
    {
      p_id: id,
      p_user_id: user.id,
    },
  );
  if (error) {
    console.error("[reservations] cancel failed", error.message);
    return fail("reservations_unavailable", 503);
  }
  if (data === "not_found") return fail("not_found", 404);
  if (data === "not_cancellable") return fail("not_cancellable", 409);

  await recordAudit({
    actor: user.id,
    action: "reservation.cancel",
    target: id,
  });
  return Response.json({ status: "cancelled" }, { headers: NO_STORE });
}
