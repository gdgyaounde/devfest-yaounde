/**
 * GET /api/admin/emails/recipients — recipient lists for the hand-sent
 * emails (ADR 0076). Organiser-only; personal data, so:
 *
 *   - `?list=launch` (default): the "paid" launch update — ticket holders,
 *     ticket buyers and site accounts;
 *   - `?list=accounts`: every account on the site — the "vote is open"
 *     email (ADR 0099), since any account can vote.
 *
 *
 *   - 404 (not 403) for anybody who is not an organiser, like every admin
 *     route — the route's existence is not advertised;
 *   - never cached: `Cache-Control: no-store`, and no static file, no public
 *     route, nothing written to the repo;
 *   - `?format=json` returns COUNTS only (for the Emails page) — no
 *     addresses; `?format=csv` returns the list and is written to the admin
 *     audit log (who exported how many, never the addresses themselves).
 *
 * There is no "send" anywhere: the organiser BCCs the list from Gmail.
 */
import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/admin/audit";
import {
  buildRecipients,
  countBySource,
  recipientsCsv,
} from "@/lib/admin/recipients";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { currentOrganiser } from "@/lib/security/organisers";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const PAGE = 1000;

/** Every row of a select, past PostgREST's per-request cap. */
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
  const accountsOnly = request.nextUrl.searchParams.get("list") === "accounts";
  const db = createAdminSupabase();

  let rows;
  try {
    const [tickets, intents, profiles] = await Promise.all([
      accountsOnly
        ? []
        : readAll((from, to) =>
            db
              .from("tickets")
              .select("attendee_email, attendee_name, deposit_id")
              .order("id")
              .range(from, to),
          ),
      accountsOnly
        ? []
        : readAll((from, to) =>
            db
              .from("payment_intents")
              .select("deposit_id, contact, locale")
              .eq("status", "activated")
              .eq("kind", "tickets")
              .order("deposit_id")
              .range(from, to),
          ),
      readAll((from, to) =>
        db
          .from("profiles")
          .select("email, display_name")
          .order("id")
          .range(from, to),
      ),
    ]);
    rows = buildRecipients({ tickets, intents, profiles });
  } catch (err) {
    console.error(
      "[admin/emails/recipients] read failed",
      (err as Error).message,
    );
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  const bySource = countBySource(rows);

  if (format === "json") {
    return Response.json(
      { total: rows.length, bySource },
      { headers: NO_STORE },
    );
  }

  await recordAudit({
    actor: organiser.userId,
    action: "emails.recipients_export",
    target: accountsOnly
      ? "vote-open-2026-11.accounts"
      : "launch-update-2026-11.paid",
    after: { total: rows.length, bySource },
  });

  return new Response(recipientsCsv(rows), {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": accountsOnly
        ? 'attachment; filename="devfest-vote-open-recipients.csv"'
        : 'attachment; filename="devfest-launch-update-paid-recipients.csv"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
