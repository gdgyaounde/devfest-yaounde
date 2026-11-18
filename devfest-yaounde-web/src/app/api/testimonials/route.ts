/**
 * /api/testimonials — anonymous testimonials (ADR 0087).
 *
 *   POST { message, role?, edition?, locale, website? } → 201 { ok: true }
 *   GET  → { testimonials: PublicTestimonial[] }   approved only, story order
 *
 * No account and nothing identifying is stored. Same-origin only, rate-limited
 * by IP (the address is used for the counter, never saved with the text), a
 * honeypot for bots. Submissions are shown straight away; organisers can take
 * one off the wall or delete it from the admin.
 */
import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { clientIp } from "@/lib/pawapay/verify";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/server";
import { checkTestimonial, testimonialSchema } from "@/lib/testimonials/rules";
import { readApprovedTestimonials } from "@/lib/testimonials/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const fail = (error: string, status: number) =>
  Response.json({ error }, { status, headers: NO_STORE });

export async function GET() {
  return Response.json(
    { testimonials: await readApprovedTestimonials() },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  if (
    !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
  ) {
    return fail("cross_origin", 403);
  }

  const ip = clientIp(request.headers) ?? "unknown";
  const limit = await rateLimit(RATE_LIMITS.testimonial, `ip:${ip}`);
  if (!limit.allowed) return fail("rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body", 400);
  }
  const parsed = testimonialSchema.safeParse(body);
  if (!parsed.success) return fail("invalid_body", 400);

  const checked = checkTestimonial(parsed.data);
  if (!checked.ok) {
    // A bot that filled the honeypot is told it worked, and nothing is kept.
    if (checked.error === "spam") {
      return Response.json({ ok: true }, { status: 201, headers: NO_STORE });
    }
    return fail(checked.error, 422);
  }

  const { error } = await createAdminSupabase().from("testimonials").insert({
    message: checked.message,
    role: checked.role,
    edition: checked.edition,
    locale: parsed.data.locale,
    // Shown straight away (ADR 0087); organisers can take it down.
    status: "approved",
  });
  if (error) {
    // Includes "relation does not exist" before migration 0039.
    console.error("[testimonials] insert failed", error.message);
    return fail("testimonials_unavailable", 503);
  }
  return Response.json({ ok: true }, { status: 201, headers: NO_STORE });
}
