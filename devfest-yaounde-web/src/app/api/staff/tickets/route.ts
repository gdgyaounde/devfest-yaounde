/**
 * GET /api/staff/tickets?q=<name> — find a ticket by the holder's name, for
 * the attendee who cannot show their code (ADR 0079).
 *
 * Day-of staff only. Deliberately narrow, because a search box over the
 * attendee list is the easiest way to leak it:
 *   - at least three letters, and only letters/digits/spaces/'.- survive;
 *   - at most eight results, so it cannot be paged through;
 *   - name, pass and the day's ticks only — never the email, the badge code
 *     or anything from the payment. Acting on a result sends the ticket id
 *     back, and the server resolves the rest;
 *   - its own tight rate limit, and an audit row per search (the length of
 *     the query, not the query: the audit log is not a second attendee list).
 */
import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/admin/audit";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import type { StaffTicketHit } from "@/lib/staff/results";
import { cleanNameQuery, MAX_SEARCH_RESULTS } from "@/lib/staff/rules";
import { createAdminSupabase } from "@/lib/supabase/server";

type SearchRow = {
  id: string;
  attendee_name: string;
  tier_id: string;
  checked_in_at: string | null;
  meal_collected_at?: string | null;
  swag_collected_at?: string | null;
};

export async function GET(request: NextRequest) {
  const staff = await guardStaff("staffSearch");
  if (staff instanceof Response) return staff;

  const q = cleanNameQuery(request.nextUrl.searchParams.get("q") ?? "");
  if (!q) return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);

  const search = (columns: string) =>
    createAdminSupabase()
      .from("tickets")
      .select(columns)
      .ilike("attendee_name", `%${q}%`)
      .order("attendee_name", { ascending: true })
      .limit(MAX_SEARCH_RESULTS)
      .returns<SearchRow[]>();
  let { data, error } = await search(
    "id, attendee_name, tier_id, checked_in_at, meal_collected_at, swag_collected_at",
  );
  // 42703 = undefined column: migration 0032 is not applied yet. The door
  // search still works; the meal/swag ticks just read as "not yet".
  if (error?.code === "42703") {
    ({ data, error } = await search(
      "id, attendee_name, tier_id, checked_in_at",
    ));
  }
  if (error || !data) {
    console.error("[staff/tickets] search failed", error?.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 500);
  }

  await recordAudit({
    actor: staff.userId,
    action: "staff.ticket_search",
    after: { role: staff.role, queryLength: q.length, results: data.length },
  });

  const hits: StaffTicketHit[] = data.map((t) => ({
    id: t.id,
    name: t.attendee_name,
    tierId: t.tier_id,
    checkedInAt: t.checked_in_at,
    mealCollectedAt: t.meal_collected_at ?? null,
    swagCollectedAt: t.swag_collected_at ?? null,
  }));
  return Response.json({ hits }, { headers: NO_STORE });
}
