/**
 * /api/admin/testimonials/[id] — moderate one testimonial (ADR 0087).
 *
 *   PATCH  { status: "approved" | "rejected" | "pending" }
 *   DELETE
 *
 * Organisers only, same-origin, rate-limited, audited.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/admin/audit";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { currentOrganiser } from "@/lib/security/organisers";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const fail = (error: string, status: number) =>
  Response.json({ error }, { status, headers: NO_STORE });

const patchSchema = z
  .object({ status: z.enum(["approved", "rejected", "pending"]) })
  .strict();
const idSchema = z.string().uuid();

async function guard(request: NextRequest) {
  const organiser = await currentOrganiser();
  if (!organiser) return { response: fail("forbidden", 403) } as const;
  if (
    !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
  ) {
    return { response: fail("cross_origin", 403) } as const;
  }
  const limit = await rateLimit(
    RATE_LIMITS.adminTestimonial,
    `user:${organiser.userId}`,
  );
  if (!limit.allowed) return { response: fail("rate_limited", 429) } as const;
  return { organiser } as const;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return fail("not_found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("invalid_body", 400);

  const { data, error } = await createAdminSupabase()
    .from("testimonials")
    .update({
      status: parsed.data.status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: g.organiser.userId,
    })
    .eq("id", id.data)
    .select("id, status")
    .maybeSingle();
  if (error) {
    console.error("[admin testimonials] update failed", error.message);
    return fail("testimonials_unavailable", 503);
  }
  if (!data) return fail("not_found", 404);
  await recordAudit({
    actor: g.organiser.userId,
    action: `testimonial.${parsed.data.status}`,
    target: id.data,
  });
  return Response.json(
    { ok: true, status: data.status },
    { headers: NO_STORE },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return fail("not_found", 404);

  const db = createAdminSupabase();
  const { data: before } = await db
    .from("testimonials")
    .select("message, status")
    .eq("id", id.data)
    .maybeSingle();
  const { error } = await db.from("testimonials").delete().eq("id", id.data);
  if (error) {
    console.error("[admin testimonials] delete failed", error.message);
    return fail("testimonials_unavailable", 503);
  }
  await recordAudit({
    actor: g.organiser.userId,
    action: "testimonial.delete",
    target: id.data,
    before,
  });
  return Response.json({ ok: true }, { headers: NO_STORE });
}
