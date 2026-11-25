/**
 * GET /api/admin/certificates/list — who the site knows was THERE, in the
 * certificates sheet's columns (ADR 0100).
 *
 *   ?format=json → counts per role and source (no names, no emails)
 *   ?format=csv  → the list itself, written to the audit log
 *
 * Organisers only (404 to anyone else, like every admin route), never
 * cached. Personal data: names and emails of checked-in attendees.
 */
import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/admin/audit";
import { toCsv } from "@/lib/admin/csv";
import {
  buildCertificateList,
  CERTIFICATE_LIST_COLUMNS,
} from "@/lib/certificates/list";
import {
  getAllSessions,
  getSpeakers,
  getTeam,
  getTiers,
} from "@/lib/content/store";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { currentOrganiser } from "@/lib/security/organisers";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const PAGE = 1000;

async function readAll<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function GET(request: NextRequest) {
  const organiser = await currentOrganiser();
  if (!organiser) return errorResponse(CHECKOUT_ERRORS.UNAUTHENTICATED, 404);

  const limit = await rateLimit(
    RATE_LIMITS.adminWrite,
    `user:${organiser.userId}`,
  );
  if (!limit.allowed) {
    return errorResponse(CHECKOUT_ERRORS.RATE_LIMITED, 429, {
      retryAfter: limit.retryAfterSeconds,
    });
  }
  const format =
    request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const db = createAdminSupabase();

  let rows;
  try {
    const [
      tickets,
      reservations,
      volunteerIds,
      speakerMarks,
      speakers,
      sessions,
      team,
      tiers,
    ] = await Promise.all([
      readAll((from, to) =>
        db
          .from("tickets")
          .select("attendee_name, attendee_email, checked_in_at, tier_id")
          .not("checked_in_at", "is", null)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        db
          .from("reservations")
          .select("contact_name, contact_email, status, checked_in_at, total_xaf")
          .not("checked_in_at", "is", null)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        db
          .from("volunteers")
          .select("user_id")
          .order("user_id")
          .range(from, to),
      ),
      readAll((from, to) =>
        db
          .from("speaker_checkins")
          .select("speaker_id, checked_in_at")
          .order("speaker_id")
          .range(from, to),
      ),
      getSpeakers(),
      getAllSessions(),
      getTeam(),
      getTiers(),
    ]);

    const ids = volunteerIds.map((v) => v.user_id);
    const profiles = ids.length
      ? ((
          await db
            .from("profiles")
            .select("id, email, display_name")
            .in("id", ids)
        ).data ?? [])
      : [];

    const arrived = new Set(
      speakerMarks.filter((m) => m.checked_in_at).map((m) => m.speaker_id),
    );
    rows = buildCertificateList({
      tickets,
      tierPrices: Object.fromEntries(tiers.map((t) => [t.id, t.priceXAF])),
      reservations: reservations.map((r) => ({
        ...r,
        contact_email: r.contact_email ?? null,
      })),
      volunteers: profiles.map((p) => ({
        name: p.display_name,
        email: p.email,
      })),
      speakers: speakers.map((s) => ({
        name: s.name,
        arrived: arrived.has(s.id),
        sessionTitles: sessions
          .filter((x) => !x.hidden && x.speakerIds.includes(s.id))
          .map((x) => x.title.fr),
      })),
      team: team
        .filter((m) => !m.alumni)
        .map((m) => ({ name: m.name, role: m.role.fr })),
    });
  } catch (err) {
    console.error(
      "[admin/certificates/list] read failed",
      (err as Error).message,
    );
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  const byRole: Record<string, number> = {};
  const missingEmail: Record<string, number> = {};
  let paidAttendees = 0;
  for (const r of rows) {
    if (r.ticket === "paid") paidAttendees++;
    byRole[r.role] = (byRole[r.role] ?? 0) + 1;
    if (!r.email) missingEmail[r.role] = (missingEmail[r.role] ?? 0) + 1;
  }

  if (format === "json") {
    return Response.json(
      { total: rows.length, byRole, missingEmail, paidAttendees },
      { headers: NO_STORE },
    );
  }

  await recordAudit({
    actor: organiser.userId,
    action: "certificates.list_export",
    target: "certificates-list",
    after: { total: rows.length, byRole },
  });

  const csv = toCsv(
    [...CERTIFICATE_LIST_COLUMNS],
    rows.map((r) => CERTIFICATE_LIST_COLUMNS.map((c) => r[c])),
  );
  return new Response(csv, {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="devfest-certificates-list.csv"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
