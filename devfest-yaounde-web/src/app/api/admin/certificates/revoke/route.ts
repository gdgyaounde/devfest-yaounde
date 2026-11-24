/**
 * POST /api/admin/certificates/revoke — withdraw (or restore) a certificate
 * (ADR 0100). Body: `{ id, revoked: boolean }`.
 *
 * Organisers only, same-origin, rate-limited, audited. The verify page then
 * says "revoked" for that number. Nothing is deleted: a mistake is undone by
 * restoring it.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/admin/audit";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { CERTIFICATE_ID } from "@/lib/certificates/rules";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { currentOrganiser } from "@/lib/security/organisers";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const bodySchema = z
  .object({ id: z.string().regex(CERTIFICATE_ID), revoked: z.boolean() })
  .strict();

export async function POST(request: NextRequest) {
  const organiser = await currentOrganiser();
  if (!organiser) return errorResponse(CHECKOUT_ERRORS.UNAUTHENTICATED, 404);
  if (
    !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
  ) {
    return Response.json(
      { error: "cross_origin" },
      { status: 403, headers: NO_STORE },
    );
  }
  const limit = await rateLimit(
    RATE_LIMITS.adminWrite,
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
  const { id, revoked } = parsed.data;

  const db = createAdminSupabase();
  const revokedAt = revoked ? new Date().toISOString() : null;
  const { data, error } = await db
    .from("certificates")
    .update({ revoked_at: revokedAt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[admin/certificates/revoke] failed", error.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }
  if (!data) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  await recordAudit({
    actor: organiser.userId,
    action: revoked ? "certificates.revoke" : "certificates.restore",
    target: id,
  });
  return Response.json({ id, revokedAt }, { headers: NO_STORE });
}
