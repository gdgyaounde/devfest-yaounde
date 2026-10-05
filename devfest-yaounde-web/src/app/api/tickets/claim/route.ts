/**
 * POST /api/tickets/claim — link a ticket bought for someone else to the
 * signed-in attendee's own account (PHASE22 §C).
 *
 * Body: { ticketId: uuid, token: string }
 *
 * The token proves the caller holds the emailed claim link
 * (`src/lib/security/claim-token.ts`); the actual row mutation happens in
 * `claim_ticket`, which claims it `FOR UPDATE` so two tabs submitting the
 * same link at once cannot both report success — the same shape
 * `check_in_ticket` already uses for the identical race.
 *
 * Sign-in is required BEFORE the token is even checked: there is no such
 * thing as an anonymous claim, since claiming means "attach this ticket to
 * MY account," and there is no account without a session.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { loadSettings } from "@/lib/content/settings";
import { eventHasEnded } from "@/lib/event";
import { logPaymentEvent } from "@/lib/payments/intents";
import { verifyClaimToken } from "@/lib/security/claim-token";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabase, currentUser } from "@/lib/supabase/server";

const bodySchema = z.object({
  ticketId: z.string().uuid(),
  token: z.string().trim().min(1).max(200),
});

function fail(code: string, status: number) {
  return Response.json({ error: code }, { status });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("unauthenticated", 401);

  const limit = await rateLimit(RATE_LIMITS.ticketClaim, `user:${user.id}`);
  if (!limit.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfter: limit.retryAfterSeconds },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("invalid_body", 400);
  const { ticketId, token } = parsed.data;

  if (!verifyClaimToken(token, ticketId)) {
    await logPaymentEvent(null, "claim_invalid_token", { ticketId });
    return fail("invalid_token", 403);
  }

  // The link itself never expires on its own (it's a pure derived HMAC —
  // see claim-token.ts), so the window is enforced here instead, against
  // the one date this project keeps in a single place. Checking in with
  // someone else's login is the entire reason to claim a ticket, and that
  // stops mattering once the event is over.
  const settings = await loadSettings();
  if (eventHasEnded(new Date(), [settings.eventDate])) {
    await logPaymentEvent(null, "claim_expired", { ticketId });
    return fail("expired", 410);
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.rpc("claim_ticket", {
    p_ticket_id: ticketId,
    p_new_user_id: user.id,
  });

  if (error) {
    console.error("[tickets/claim] rpc failed", error.message);
    return fail("server_error", 500);
  }

  const result = data as {
    status: "claimed" | "already_claimed" | "not_claimable" | "not_found";
    attendeeName?: string;
    tierId?: string;
  };

  await logPaymentEvent(null, `claim_${result.status}`, { ticketId });

  if (result.status === "not_found") return fail("not_found", 404);
  if (result.status === "already_claimed") return fail("already_claimed", 409);
  if (result.status === "not_claimable") return fail("not_claimable", 400);

  return Response.json({
    status: "claimed",
    attendeeName: result.attendeeName,
    tierId: result.tierId,
  });
}
