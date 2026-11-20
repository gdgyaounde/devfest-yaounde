/**
 * POST /api/staff/guide-ack — "I have read and understood" (ADR 0090).
 *
 * Staff only, same-origin only. Sets the acknowledgement cookie for this
 * person and writes the confirmation to the audit log, so an organiser can
 * see who confirmed and when.
 */
import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/admin/audit";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import { GUIDE_COOKIE, GUIDE_COOKIE_MAX_AGE } from "@/lib/staff/guide-ack";

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

  await recordAudit({ actor: staff.userId, action: "staff.guide_ack" });
  const response = Response.json({ ok: true }, { headers: NO_STORE });
  response.headers.append(
    "Set-Cookie",
    [
      `${GUIDE_COOKIE}=${staff.userId}`,
      "Path=/",
      `Max-Age=${GUIDE_COOKIE_MAX_AGE}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    ].join("; "),
  );
  return response;
}
