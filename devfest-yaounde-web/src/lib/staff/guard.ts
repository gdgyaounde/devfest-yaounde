/**
 * The first lines of every day-of staff route (ADR 0079): who is asking,
 * and are they going too fast. Returns the staff context, or the response
 * to send instead.
 */
import "server-only";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { currentStaff, type StaffContext } from "@/lib/security/staff";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function guardStaff(
  bucket: keyof typeof RATE_LIMITS,
): Promise<StaffContext | Response> {
  const staff = await currentStaff();
  if (!staff) return errorResponse(CHECKOUT_ERRORS.UNAUTHENTICATED, 403);
  const limit = await rateLimit(RATE_LIMITS[bucket], `user:${staff.userId}`);
  if (!limit.allowed) {
    return errorResponse(CHECKOUT_ERRORS.RATE_LIMITED, 429, {
      retryAfter: limit.retryAfterSeconds,
    });
  }
  return staff;
}
