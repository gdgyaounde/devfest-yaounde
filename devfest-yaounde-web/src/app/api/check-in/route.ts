/**
 * POST /api/check-in — check someone in at the door.
 *
 * Body: `{ badgeCode: "DFY-XXXXX-XXXXX" }` (scanned or typed) or
 * `{ ticketId }` (picked from a name search on the door screen).
 *
 * Day-of staff only: organisers and active volunteers (ADR 0079). The actual
 * marking happens in `check_in_ticket`, which claims the row `FOR UPDATE`,
 * so two people scanning the same badge at the same moment cannot both
 * record a first entry — the second one is told when it was already used.
 *
 * "Already checked in" is a 200, not an error: at a door it is normal
 * information, and the person scanning needs the timestamp, not a red screen.
 *
 * A refund on file is reported alongside the result, never instead of it
 * (ADR 0078): a free pass gets anyone in, so a refunded ticket still admits —
 * it just no longer carries the paid perks, and the volunteer needs to know.
 */
import { NextRequest } from "next/server";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { logPaymentEvent } from "@/lib/payments/intents";
import { recordAudit } from "@/lib/admin/audit";
import { currentStaff } from "@/lib/security/staff";
import { createAdminSupabase } from "@/lib/supabase/server";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import type { CheckInResult } from "@/lib/tickets/check-in";
import { buildPack } from "@/lib/staff/pack";
import { loadProducts, loadTiers } from "@/lib/payments/catalog";
import {
  findTicket,
  refundStandingFor,
  ticketSelectorSchema,
} from "@/lib/staff/tickets";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const staff = await currentStaff();
  if (!staff) return errorResponse(CHECKOUT_ERRORS.UNAUTHENTICATED, 403);

  // Bounds brute-forcing of the code space by a compromised staff session.
  const limit = await rateLimit(RATE_LIMITS.checkIn, `user:${staff.userId}`);
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
  const parsed = ticketSelectorSchema.safeParse(body);
  if (!parsed.success) return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);

  const supabase = createAdminSupabase();
  const ticket = await findTicket(supabase, parsed.data);
  if (ticket === "error") {
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  let result: CheckInResult;
  if (!ticket) {
    result = { status: "not_found" };
  } else {
    const [rpc, refund, tiers, products] = await Promise.all([
      supabase.rpc("check_in_ticket", { p_badge_code: ticket.badge_code }),
      refundStandingFor(supabase, ticket),
      loadTiers(),
      loadProducts(),
    ]);
    if (rpc.error) {
      console.error("[check-in] rpc failed", rpc.error.message);
      return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
    }
    const raw = rpc.data as {
      status: CheckInResult["status"];
      checkedInAt?: string;
    };
    const flag = refund && refund !== "error" ? { refund } : {};
    // What their pack offers (ADR 0091) — the same rule the meal and swag
    // tables enforce, so the door never promises what a table will refuse.
    const pack = buildPack({
      tier: tiers.find((t) => t.id === ticket.tier_id) ?? null,
      products,
      refund: refund && refund !== "error" ? refund : null,
      apparelSize: ticket.apparel_size,
    });
    result =
      raw.status === "not_found"
        ? { status: "not_found" }
        : raw.status === "already_checked_in"
          ? {
              status: "already_checked_in",
              attendeeName: ticket.attendee_name,
              tierId: ticket.tier_id,
              checkedInAt: raw.checkedInAt ?? ticket.checked_in_at ?? "",
              pack,
              ...flag,
            }
          : {
              status: "checked_in",
              attendeeName: ticket.attendee_name,
              tierId: ticket.tier_id,
              pack,
              ...flag,
            };
  }

  const tierId = result.status === "not_found" ? null : result.tierId;
  // A09: who scanned what, without writing the attendee's name into the log.
  await logPaymentEvent(null, `checkin_${result.status}`, {
    staffId: staff.userId,
    role: staff.role,
    tierId,
  });
  await recordAudit({
    actor: staff.userId,
    action: `checkin.${result.status}`,
    target:
      "badgeCode" in parsed.data
        ? parsed.data.badgeCode
        : (ticket?.badge_code ?? parsed.data.ticketId),
    after: {
      status: result.status,
      tierId,
      role: staff.role,
      via: "badgeCode" in parsed.data ? "code" : "search",
      refund: result.status === "not_found" ? null : (result.refund ?? null),
    },
  });

  return Response.json(result, {
    status: result.status === "not_found" ? 404 : 200,
    headers: NO_STORE,
  });
}
