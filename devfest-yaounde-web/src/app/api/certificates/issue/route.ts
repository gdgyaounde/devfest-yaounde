/**
 * POST /api/certificates/issue — the certificates Apps Script records what it
 * generated (ADR 0100), so the QR code on each PDF can be verified.
 *
 *   Authorization: Bearer <CERTIFICATES_SECRET>
 *   { certificates: [{ id, edition, fullName, role, detail? }, …] }  (1–200)
 *   → 200 { issued: n }
 *
 * - No secret configured → 503 (refuses outright, like the cron route); a
 *   wrong or missing one → 401. Compared in constant time.
 * - The body is validated strictly (`issueSchema`): no email can ever be
 *   stored, because the schema has no field for one.
 * - Re-issuing the same id updates the name/role/detail (a typo fixed in
 *   the sheet and the PDF regenerated) but keeps the original `issued_at`
 *   and never clears a revocation.
 * - Without migration 0048 → 503, nothing written.
 */
import { NextRequest } from "next/server";
import { bearerMatches, issueSchema } from "@/lib/certificates/rules";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const fail = (error: string, status: number) =>
  Response.json({ error }, { status, headers: NO_STORE });

export async function POST(request: NextRequest) {
  const secret = process.env.CERTIFICATES_SECRET ?? "";
  if (!secret) return fail("not_configured", 503);
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return fail("unauthorised", 401);
  }

  const limit = await rateLimit(
    RATE_LIMITS.certificateIssue,
    "service:certificates",
  );
  if (!limit.allowed) return fail("rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body", 400);
  }
  const parsed = issueSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid_body",
        // Which field, so the script can put it in the row's error column.
        issues: parsed.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const now = new Date().toISOString();
  const rows = parsed.data.certificates.map((c) => ({
    id: c.id,
    edition: c.edition,
    full_name: c.fullName,
    role: c.role,
    detail: c.detail || null,
    updated_at: now,
  }));

  const db = createAdminSupabase();
  // Omitting issued_at / revoked_at from the row means an upsert never resets
  // them: a re-issue keeps the first issue date and any revocation.
  const { error } = await db
    .from("certificates")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    const missing = /does not exist|could not find|PGRST205|42P01/i.test(
      `${error.code} ${error.message}`,
    );
    if (!missing)
      console.error("[certificates/issue] upsert failed", error.message);
    return fail(missing ? "unavailable" : "failed", missing ? 503 : 500);
  }
  return Response.json({ issued: rows.length }, { headers: NO_STORE });
}
