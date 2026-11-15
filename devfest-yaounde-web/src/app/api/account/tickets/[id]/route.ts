/**
 * PATCH /api/account/tickets/[id] — a holder changes their ticket's name or
 * T-shirt size, until the edits cutoff (ADR 0075).
 *
 * Order matters, and every step can only narrow:
 *   1. a signed-in user, or 401;
 *   2. the per-user rate limit, or 429;
 *   3. the ticket, loaded through the SESSION client and then checked against
 *      the user again — RLS lets an organiser read every ticket, so "RLS
 *      returned it" is not proof of ownership on its own. Anybody else's
 *      ticket (or a junk id) is a 404, never a 403: a 403 would confirm the
 *      ticket exists;
 *   4. the body, against a STRICT schema — only `attendeeName` and
 *      `apparelSize`; an unknown key is a 400;
 *   5. the rules (`decideTicketEdit`): edits cutoff, checked in, refund
 *      requested or granted, apparel on a tier without it;
 *   6. the write, with the ADMIN client. There is deliberately no client
 *      UPDATE policy on money tables, and this does not add one.
 *   7. an audit row (the audit log takes any signed-in actor).
 */
import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/admin/audit";
import { loadSettings } from "@/lib/content/settings";
import { findTier, loadTiers } from "@/lib/payments/catalog";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import {
  createAdminSupabase,
  createServerSupabase,
  currentUser,
} from "@/lib/supabase/server";
import {
  BLOCKING_REFUND_STATUSES,
  TICKET_EDIT_ERRORS,
  decideTicketEdit,
  isTicketId,
  ownedTicket,
  refundReferencesFor,
  ticketEditSchema,
  type TicketEditError,
} from "@/lib/tickets/self-edit";

function fail(code: TicketEditError, status: number, extra?: object) {
  return Response.json({ error: code, ...extra }, { status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return fail(TICKET_EDIT_ERRORS.UNAUTHENTICATED, 401);

  const limit = await rateLimit(RATE_LIMITS.ticketEdit, `user:${user.id}`);
  if (!limit.allowed) {
    return fail(TICKET_EDIT_ERRORS.RATE_LIMITED, 429, {
      retryAfter: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  if (!isTicketId(id)) return fail(TICKET_EDIT_ERRORS.NOT_FOUND, 404);

  const supabase = await createServerSupabase();
  const { data: row, error: readError } = await supabase
    .from("tickets")
    .select(
      "id, user_id, tier_id, deposit_id, badge_code, attendee_name, apparel_size, checked_in_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("[account/tickets/edit] read failed", readError.message);
    return fail(TICKET_EDIT_ERRORS.SERVER_ERROR, 500);
  }
  // Not yours (including an organiser looking at someone else's) = 404.
  const owned = ownedTicket(row, user.id);
  if (!owned.ok) return fail(owned.code, owned.status);
  const ticket = owned.ticket;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(TICKET_EDIT_ERRORS.INVALID_BODY, 400);
  }
  const parsed = ticketEditSchema.safeParse(body);
  if (!parsed.success) return fail(TICKET_EDIT_ERRORS.INVALID_BODY, 400);

  const admin = createAdminSupabase();
  const references = refundReferencesFor(ticket).flatMap((r) => [
    r,
    r.toUpperCase(),
    r.toLowerCase(),
  ]);
  const [settings, tiers, refunds] = await Promise.all([
    loadSettings(),
    loadTiers(),
    admin
      .from("refund_requests")
      .select("id")
      .eq("kind", "tickets")
      .in("status", [...BLOCKING_REFUND_STATUSES])
      .in("reference", [...new Set(references)])
      .limit(1),
  ]);
  if (refunds.error) {
    console.error(
      "[account/tickets/edit] refund check failed",
      refunds.error.message,
    );
    return fail(TICKET_EDIT_ERRORS.SERVER_ERROR, 500);
  }

  const decision = decideTicketEdit({
    now: new Date(),
    settings,
    ticket,
    tierIncludesApparel:
      findTier(ticket.tier_id, tiers)?.includesApparel ?? false,
    hasBlockingRefund: (refunds.data ?? []).length > 0,
    edit: parsed.data,
  });
  if (!decision.ok) return fail(decision.code, decision.status);

  const { data: updated, error: writeError } = await admin
    .from("tickets")
    .update(decision.update)
    .eq("id", ticket.id)
    .eq("user_id", user.id)
    .select("id, attendee_name, apparel_size")
    .maybeSingle();
  if (writeError || !updated) {
    console.error("[account/tickets/edit] write failed", writeError?.message);
    return fail(TICKET_EDIT_ERRORS.SERVER_ERROR, 500);
  }

  await recordAudit({
    actor: user.id,
    action: "ticket.self_edit",
    target: ticket.id,
    before: {
      attendee_name: ticket.attendee_name,
      apparel_size: ticket.apparel_size,
    },
    after: {
      attendee_name: updated.attendee_name,
      apparel_size: updated.apparel_size,
    },
  });

  return Response.json(
    {
      ticket: {
        id: updated.id,
        attendeeName: updated.attendee_name,
        apparelSize: updated.apparel_size,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
