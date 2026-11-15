/**
 * POST /api/check-in — scan a badge at the door.
 *
 * Body: { badgeCode: "DFY-XXXXX-XXXXX" }
 *
 * Organiser-only. The actual marking happens in `check_in_ticket`, which
 * claims the row `FOR UPDATE`, so two volunteers scanning the same badge at
 * the same moment cannot both record a first entry — the second one is told
 * when it was already used.
 *
 * "Already checked in" is a 200, not an error: at a door it is normal
 * information, and the person scanning needs the timestamp, not a red screen.
 *
 * A refund on file is reported alongside the result, never instead of it
 * (ADR 0078): a free pass gets anyone in, so a refunded ticket still admits —
 * it just no longer carries the paid perks, and the volunteer needs to know.
 * The scanner screen is `/admin/check-in`.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { logPaymentEvent } from "@/lib/payments/intents";
import { recordAudit } from "@/lib/admin/audit";
import { currentOrganiser } from "@/lib/security/organisers";
import { createAdminSupabase } from "@/lib/supabase/server";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import {
  normaliseBadgeCode,
  refundStanding,
  type CheckInResult,
  type RefundStanding,
} from "@/lib/tickets/check-in";
import { refundReferencesFor } from "@/lib/tickets/self-edit";

/**
 * Shape is fixed by badge-code.ts; anything else is a typo or a probe.
 * Normalised the same way the scanner normalises typed codes, so a code the
 * screen accepted is never rejected here for its case or its dashes.
 */
const bodySchema = z.object({
  badgeCode: z
    .string()
    .max(40)
    .transform((value, ctx) => {
      const code = normaliseBadgeCode(value);
      if (!code) {
        ctx.addIssue({ code: "custom", message: "invalid badge code" });
        return z.NEVER;
      }
      return code;
    }),
});

type Admin = ReturnType<typeof createAdminSupabase>;

/**
 * The refund standing for the ticket behind `badgeCode`, or null.
 *
 * FAILS OPEN, deliberately: this only adds a warning to a scan, and a
 * database hiccup must not stop the queue at the door. The error is logged
 * so a missing warning can be explained afterwards.
 */
async function refundFor(
  supabase: Admin,
  badgeCode: string,
): Promise<RefundStanding | null> {
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("id, badge_code, deposit_id")
    .eq("badge_code", badgeCode)
    .maybeSingle();
  if (error) {
    console.error("[check-in] ticket lookup failed", error.message);
    return null;
  }
  if (!ticket) return null;

  const references = refundReferencesFor(ticket).flatMap((r) => [
    r,
    r.toUpperCase(),
    r.toLowerCase(),
  ]);
  const { data: refunds, error: refundError } = await supabase
    .from("refund_requests")
    .select("status")
    .eq("kind", "tickets")
    .in("reference", [...new Set(references)]);
  if (refundError) {
    console.error("[check-in] refund lookup failed", refundError.message);
    return null;
  }
  return refundStanding((refunds ?? []).map((r) => r.status));
}

export async function POST(request: NextRequest) {
  const organiser = await currentOrganiser();
  if (!organiser) return errorResponse(CHECKOUT_ERRORS.UNAUTHENTICATED, 403);

  // Bounds brute-forcing of the code space by a compromised organiser session.
  const limit = await rateLimit(
    RATE_LIMITS.checkIn,
    `user:${organiser.userId}`,
  );
  if (!limit.allowed) {
    return errorResponse(CHECKOUT_ERRORS.RATE_LIMITED, 429, {
      retryAfter: limit.retryAfterSeconds,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);

  const supabase = createAdminSupabase();
  const [rpc, refund] = await Promise.all([
    supabase.rpc("check_in_ticket", {
      p_badge_code: parsed.data.badgeCode,
    }),
    refundFor(supabase, parsed.data.badgeCode),
  ]);

  if (rpc.error) {
    console.error("[check-in] rpc failed", rpc.error.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  const raw = rpc.data as {
    status: CheckInResult["status"];
    attendeeName?: string;
    tierId?: string;
    checkedInAt?: string;
  };
  const result: CheckInResult =
    raw.status === "not_found"
      ? { status: "not_found" }
      : raw.status === "already_checked_in"
        ? {
            status: "already_checked_in",
            attendeeName: raw.attendeeName ?? "",
            tierId: raw.tierId ?? "",
            checkedInAt: raw.checkedInAt ?? "",
            ...(refund ? { refund } : {}),
          }
        : {
            status: "checked_in",
            attendeeName: raw.attendeeName ?? "",
            tierId: raw.tierId ?? "",
            ...(refund ? { refund } : {}),
          };
  const tierId = result.status === "not_found" ? null : result.tierId;

  // A09: who scanned what, without writing the attendee's name into the log.
  await logPaymentEvent(null, `checkin_${result.status}`, {
    organiserId: organiser.userId,
    tierId,
  });
  await recordAudit({
    actor: organiser.userId,
    action: `checkin.${result.status}`,
    target: parsed.data.badgeCode,
    after: { status: result.status, tierId, refund: refund ?? null },
  });

  return Response.json(result, {
    status: result.status === "not_found" ? 404 : 200,
  });
}
