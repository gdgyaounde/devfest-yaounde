/**
 * POST /api/staff/perks — hand out a paid pass's meal or swag (ADR 0079).
 *
 * Body: `{ perk: "meal" | "swag", badgeCode }` or `{ perk, ticketId }`.
 *
 * Day-of staff only. Eligibility is decided HERE from the pass (free passes
 * and refunded tickets get neither — ADR 0074, 0078), then
 * `collect_ticket_perk` marks it under a row lock, so two tables scanning the
 * same badge cannot both hand out the same meal. "Already collected" is a 200
 * with the time, like "already checked in" at the door.
 *
 * Unlike the door, the refund check FAILS CLOSED here: if it cannot be read,
 * nothing is handed out — a meal given away cannot be taken back, and the
 * volunteer can simply retry.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/admin/audit";
import { findTier, loadProducts, loadTiers } from "@/lib/payments/catalog";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import type { PerkResult } from "@/lib/staff/results";
import { perkEligibility } from "@/lib/staff/rules";
import {
  findTicket,
  refundStandingFor,
  ticketSelectorSchema,
} from "@/lib/staff/tickets";
import { createAdminSupabase } from "@/lib/supabase/server";

const perkSchema = z.object({ perk: z.enum(["meal", "swag"]) });

export async function POST(request: NextRequest) {
  const staff = await guardStaff("staffPerk");
  if (staff instanceof Response) return staff;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  }
  const perkPart = perkSchema.safeParse(body);
  const { perk: _omit, ...rest } = (body ?? {}) as Record<string, unknown>;
  void _omit;
  const selector = ticketSelectorSchema.safeParse(rest);
  if (!perkPart.success || !selector.success) {
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  }
  const { perk } = perkPart.data;

  const supabase = createAdminSupabase();
  const ticket = await findTicket(supabase, selector.data);
  if (ticket === "error") {
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  let result: PerkResult;
  if (!ticket) {
    result = { status: "not_found", perk };
  } else {
    const [tiers, refund] = await Promise.all([
      loadTiers(),
      refundStandingFor(supabase, ticket, { strict: true }),
    ]);
    if (refund === "error") {
      return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
    }
    const tier = findTier(ticket.tier_id, tiers) ?? null;
    const eligibility = perkEligibility({ perk, tier, refund });

    if (!eligibility.ok) {
      result = {
        status: "not_eligible",
        perk,
        attendeeName: ticket.attendee_name,
        tierId: ticket.tier_id,
        reason: eligibility.reason,
      };
    } else {
      const rpc = await supabase.rpc("collect_ticket_perk", {
        p_ticket_id: ticket.id,
        p_perk: perk,
      });
      if (rpc.error) {
        console.error("[staff/perks] rpc failed", rpc.error.message);
        return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
      }
      const raw = rpc.data as {
        status: "collected" | "already_collected" | "not_found";
        collectedAt?: string;
      };
      if (raw.status === "not_found") {
        result = { status: "not_found", perk };
      } else {
        let swag: {
          items?: { fr: string; en: string }[];
          apparelSize?: string | null;
        } = {};
        if (perk === "swag" && tier) {
          const products = await loadProducts();
          const byId = new Map(products.map((p) => [p.id, p.name]));
          swag = {
            items: (tier.swagProductIds ?? [])
              .map((id) => byId.get(id))
              .filter((n): n is { fr: string; en: string } => Boolean(n)),
            // Present only when the pass includes a shirt, so the screen can
            // tell "no shirt" from "shirt, but no size on file".
            ...(tier.includesApparel
              ? { apparelSize: ticket.apparel_size }
              : {}),
          };
        }
        result = {
          status: raw.status,
          perk,
          ticketId: ticket.id,
          attendeeName: ticket.attendee_name,
          tierId: ticket.tier_id,
          collectedAt: raw.collectedAt ?? new Date().toISOString(),
          ...swag,
        };
      }
    }
  }

  await recordAudit({
    actor: staff.userId,
    action: `perk.${perk}.${result.status}`,
    target: ticket?.id,
    after: {
      role: staff.role,
      via: "badgeCode" in selector.data ? "code" : "search",
      ...(result.status === "not_eligible" ? { reason: result.reason } : {}),
    },
  });

  return Response.json(result, {
    status: result.status === "not_found" ? 404 : 200,
    headers: NO_STORE,
  });
}
