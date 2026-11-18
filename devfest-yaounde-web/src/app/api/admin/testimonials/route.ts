/**
 * GET /api/admin/testimonials — every submission, newest first (ADR 0087).
 * Organisers only. There is nothing personal in a row to protect beyond the
 * text itself, which is exactly what moderation needs to read.
 */
import { currentOrganiser } from "@/lib/security/organisers";
import { createAdminSupabase } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const organiser = await currentOrganiser();
  if (!organiser) {
    return Response.json(
      { error: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }
  const { data, error } = await createAdminSupabase()
    .from("testimonials")
    .select(
      "id, message, role, edition, locale, status, created_at, reviewed_at",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("[admin testimonials] read failed", error.message);
    return Response.json(
      { error: "testimonials_unavailable", rows: [] },
      { status: 503, headers: NO_STORE },
    );
  }
  return Response.json(
    {
      rows: (data ?? []).map((r) => ({
        id: r.id,
        message: r.message,
        role: r.role,
        edition: r.edition,
        locale: r.locale,
        status: r.status,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
      })),
    },
    { headers: NO_STORE },
  );
}
