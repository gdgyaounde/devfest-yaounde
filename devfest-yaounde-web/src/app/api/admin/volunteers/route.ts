/**
 * POST /api/admin/volunteers — add or remove a day-of volunteer (ADR 0079).
 *
 * Body: `{ userId, action: "add" | "remove" }`.
 *
 * Organisers only. The rules live in `set_volunteer()` (migration 0032),
 * which re-checks the caller inside the membership lock and writes the audit
 * row in the same transaction. The expiry is NOT taken from the client: it is
 * always 23:59 Yaoundé the day after the event date in settings.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { loadSettings } from "@/lib/content/settings";
import { currentOrganiser } from "@/lib/security/organisers";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { volunteerExpiry } from "@/lib/staff/rules";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { createAdminSupabase } from "@/lib/supabase/server";
import { NO_STORE } from "@/lib/staff/guard";

const bodySchema = z
  .object({
    userId: z.string().uuid(),
    action: z.enum(["add", "remove"]),
  })
  .strict();

const MESSAGES: Record<string, { status: number; message: string }> = {
  already_admin: {
    status: 409,
    message: "They're already an admin — admins can use every day-of tool.",
  },
  not_volunteer: { status: 409, message: "They're not a volunteer." },
  bad_expiry: {
    status: 409,
    message:
      "The event date in settings is in the past, so access would already have ended.",
  },
  actor_not_admin: { status: 403, message: "Only admins can change this." },
};

export async function POST(request: NextRequest) {
  const organiser = await currentOrganiser();
  if (!organiser) return errorResponse(CHECKOUT_ERRORS.UNAUTHENTICATED, 403);

  // Same CSRF stance as admin role changes: a membership change from another
  // origin is refused before anything is read.
  if (
    !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
  ) {
    return Response.json(
      { error: "cross_origin", message: "Reload the page and try again." },
      { status: 403, headers: NO_STORE },
    );
  }

  const limit = await rateLimit(
    RATE_LIMITS.adminVolunteer,
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
  const { userId, action } = parsed.data;

  const supabase = createAdminSupabase();
  // The person must exist (and so have signed in at least once).
  const { data: target, error: targetError } =
    await supabase.auth.admin.getUserById(userId);
  if (targetError || !target.user) {
    return Response.json(
      { error: "not_found", message: "No account with that id." },
      { status: 404, headers: NO_STORE },
    );
  }

  const expiresAt =
    action === "add" ? volunteerExpiry((await loadSettings()).eventDate) : null;

  const { data, error } = await supabase.rpc("set_volunteer", {
    p_actor: organiser.userId,
    p_target: userId,
    p_action: action,
    ...(expiresAt ? { p_expires_at: expiresAt } : {}),
  });
  if (error) {
    console.error("[admin/volunteers] rpc error", error.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  if (data !== "ok") {
    const known = MESSAGES[String(data)];
    return Response.json(
      { error: String(data), message: known?.message ?? "That didn't work." },
      { status: known?.status ?? 409, headers: NO_STORE },
    );
  }
  return Response.json({ ok: true, expiresAt }, { headers: NO_STORE });
}
