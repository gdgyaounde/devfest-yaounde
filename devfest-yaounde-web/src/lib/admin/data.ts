import "server-only";
import { isMissingVoteSchema, parseVoteStats } from "@/lib/pitch-vote";
import { createAdminSupabase } from "@/lib/supabase/server";
import { currentOrganiser } from "@/lib/security/organisers";
import { signedUrl } from "@/lib/dp/gallery-server";

/**
 * Everything the dashboard reads, in one place, behind one gate.
 *
 * EVERY function here re-checks `currentOrganiser()` itself rather than
 * trusting that a layout already did. A layout gate protects the page someone
 * navigates to; it does not protect a function that some future route imports
 * without thinking. The check is a table lookup on a session that is already
 * in memory, so the cost of doing it twice is not worth the risk of assuming.
 *
 * These are READS ONLY. Every write the dashboard performs goes through an
 * endpoint that already exists and does its own organiser check — see
 * docs/backend/ADMIN-CAPABILITIES.md for why no new route was added.
 */

export class NotAnOrganiser extends Error {}

async function gate() {
  const organiser = await currentOrganiser();
  if (!organiser) throw new NotAnOrganiser();
  return organiser;
}

export * from "./shape";
import type { AdminData, AdminReservation } from "./shape";
import { LIST_CAP } from "./shape";
import { apparelTotals } from "@/lib/tickets/apparel-totals";
import { loadProducts, loadTiers } from "@/lib/payments/catalog";
import { getSessions } from "@/lib/content/store";
import { interestRows } from "@/lib/interests/rules";
import {
  commerceRecap,
  type RecapOrder,
  type RecapTicket,
} from "@/lib/admin/commerce-recap";

/**
 * Every ticket's tier and size, paged. The list above is capped at LIST_CAP
 * and PostgREST caps a single response at 1,000 rows, so the apparel totals
 * — which organisers order shirts from — read their own complete column.
 */
async function allApparelRows(db: ReturnType<typeof createAdminSupabase>) {
  const PAGE = 1000;
  const rows: { tier_id: string; apparel_size: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("tickets")
      .select("tier_id, apparel_size")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[admin] apparel totals read failed", error.message);
      break;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Everything the commerce recap counts, read complete and paged — it feeds
 * stock for the day, so a capped list would quietly under-count (ADR 0083).
 * A failed read is logged and leaves that part empty rather than breaking
 * the dashboard.
 */
async function loadCommerceInputs(
  db: ReturnType<typeof createAdminSupabase>,
): Promise<{
  tickets: RecapTicket[];
  orders: RecapOrder[];
  refunded: Set<string>;
  reservations: AdminReservation[];
}> {
  const PAGE = 1000;
  async function paged<T>(
    what: string,
    read: (
      from: number,
      to: number,
    ) => PromiseLike<{
      data: T[] | null;
      error: { message: string } | null;
    }>,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await read(from, from + PAGE - 1);
      if (error) {
        console.error(`[admin] commerce ${what} read failed`, error.message);
        break;
      }
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }
  const [tickets, orders, refunds, reservationRows] = await Promise.all([
    paged("tickets", (from, to) =>
      db
        .from("tickets")
        .select("id, badge_code, deposit_id, tier_id")
        .order("id")
        .range(from, to),
    ),
    paged("orders", (from, to) =>
      db
        .from("orders")
        .select(
          "id, status, order_items(product_id, name_snapshot, quantity, unit_amount, variant)",
        )
        .order("id")
        .range(from, to),
    ),
    paged("refunds", (from, to) =>
      db
        .from("refund_requests")
        .select("reference")
        .eq("status", "resolved")
        .order("id")
        .range(from, to),
    ),
    // Before migration 0034 the table does not exist: that reads as "none".
    paged("reservations", (from, to) =>
      db
        .from("reservations")
        .select(
          "id, reference, status, contact_name, contact_phone, contact_email, tickets, items, total_xaf, created_at, cash_received_at, checked_in_at",
        )
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
  ]);
  return {
    tickets,
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      items: (o.order_items ?? []).map((i) => ({
        productId: i.product_id,
        name: i.name_snapshot as { fr: string; en: string } | string,
        quantity: i.quantity,
        unitAmount: i.unit_amount,
        variant: i.variant,
      })),
    })),
    refunded: new Set(refunds.map((r) => r.reference.toLowerCase())),
    reservations: reservationRows.map((r) => ({
      id: r.id,
      reference: r.reference,
      status: r.status as AdminReservation["status"],
      contactName: r.contact_name,
      contactPhone: r.contact_phone,
      contactEmail: r.contact_email,
      tickets: r.tickets as unknown as AdminReservation["tickets"],
      items: r.items as unknown as AdminReservation["items"],
      totalXaf: r.total_xaf,
      createdAt: r.created_at,
      cashReceivedAt: r.cash_received_at,
      checkedInAt: r.checked_in_at,
    })),
  };
}

/**
 * Who voted in the pitch vote (ADR 0099), for the organisers: name, email,
 * first vote, number of picks. Which projects they picked is deliberately
 * NOT read. Before migration 0046 the table is missing: reads as nobody.
 */
async function loadPitchVoters(
  db: ReturnType<typeof createAdminSupabase>,
): Promise<AdminData["pitchVoters"]> {
  const PAGE = 1000;
  const byUser = new Map<string, { votedAt: string; picks: number }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("pitch_votes")
      .select("user_id, created_at")
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) {
      if (!isMissingVoteSchema(error)) {
        console.error("[admin] pitch voters read failed", error.message);
      }
      return [];
    }
    for (const row of data ?? []) {
      const seen = byUser.get(row.user_id);
      if (!seen) byUser.set(row.user_id, { votedAt: row.created_at, picks: 1 });
      else {
        seen.picks += 1;
        if (row.created_at < seen.votedAt) seen.votedAt = row.created_at;
      }
    }
    if (!data || data.length < PAGE) break;
  }
  const ids = [...byUser.keys()];
  const people = new Map<string, { email: string; name: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("profiles")
      .select("id, email, display_name")
      .in("id", ids.slice(i, i + 200));
    if (error) {
      console.error("[admin] pitch voter profiles read failed", error.message);
      break;
    }
    for (const p of data ?? []) {
      people.set(p.id, { email: p.email ?? "", name: p.display_name ?? "" });
    }
  }
  return ids
    .map((id) => ({
      name: people.get(id)?.name ?? "",
      email: people.get(id)?.email ?? "",
      votedAt: byUser.get(id)!.votedAt,
      picks: byUser.get(id)!.picks,
    }))
    .sort((a, b) => a.votedAt.localeCompare(b.votedAt));
}

export async function loadAdminData(): Promise<AdminData> {
  const organiser = await gate();
  const db = createAdminSupabase();

  const [
    apparelRows,
    tiers,
    products,
    commerceInputs,
    interestCounts,
    sessions,
    pitchVoters,
    pitchVote,
  ] = await Promise.all([
    allApparelRows(db),
    loadTiers(),
    loadProducts(),
    loadCommerceInputs(db),
    // Counts only. Before migration 0038 the function is missing: reads as none.
    db.rpc("session_interest_counts").then(({ data, error }) => {
      if (error) {
        console.error("[admin] session interest read failed", error.message);
        return [];
      }
      return data ?? [];
    }),
    getSessions(),
    loadPitchVoters(db),
    // The live tally (ADR 0099). Before migration 0046: null, and the view
    // says so.
    db.rpc("pitch_vote_stats").then(({ data, error }) => {
      if (error) {
        if (!isMissingVoteSchema(error)) {
          console.error("[admin] pitch vote read failed", error.message);
        }
        return null;
      }
      return parseVoteStats(data);
    }),
  ]);
  const interest = interestRows(interestCounts, sessions);
  const [tickets, orders, intents, users, discounts, refundRequests] =
    await Promise.all([
      db
        .from("tickets")
        .select(
          "id, badge_code, attendee_name, attendee_email, tier_id, apparel_size, checked_in_at, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .limit(LIST_CAP),
      db
        .from("orders")
        .select(
          "id, status, total_amount, currency, created_at, fulfilment, order_items(product_id, name_snapshot, quantity, unit_amount, variant)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .limit(LIST_CAP),
      db
        .from("payment_intents")
        .select(
          "deposit_id, kind, status, charged_amount, net_amount, discount_code, discount_amount, currency, failure_code, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .limit(LIST_CAP),
      db
        .from("profiles")
        .select("id, display_name, email, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(LIST_CAP),
      db
        .from("discount_codes")
        .select(
          "code, kind, value, applies_to, active, redeemed_count, max_redemptions, expires_at",
        )
        .order("code"),
      db
        .from("refund_requests")
        .select(
          "id, kind, reference, requester_name, requester_email, reason, status, notes, created_by, created_at, updated_at, resolved_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .limit(LIST_CAP),
    ]);

  const wallEnabled = process.env.NEXT_PUBLIC_DP_GALLERY === "1";
  let wallPending = 0;
  let wallApproved = 0;
  let wallReports: AdminData["wallReports"] = [];
  let wallCards: AdminData["wallCards"] = [];
  if (wallEnabled) {
    const [pending, approved, reports] = await Promise.all([
      db
        .from("dp_cards")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      db
        .from("dp_cards")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      db
        .from("dp_card_reports")
        .select("id, card_id, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    wallPending = pending.count ?? 0;
    wallApproved = approved.count ?? 0;

    const reportRows = reports.data ?? [];
    const cardIds = [...new Set(reportRows.map((row) => row.card_id))];
    const cards =
      cardIds.length === 0
        ? []
        : ((
            await db
              .from("dp_cards")
              .select("id, nickname, status, storage_path")
              .in("id", cardIds)
          ).data ?? []);
    const byId = new Map(cards.map((card) => [card.id, card]));
    wallReports = await Promise.all(
      reportRows.map(async (row) => {
        const card = byId.get(row.card_id);
        return {
          id: row.id,
          cardId: row.card_id,
          nickname: card?.nickname ?? "unknown",
          status: card?.status ?? "gone",
          imageUrl: card ? await signedUrl(card.storage_path) : null,
          createdAt: row.created_at,
        };
      }),
    );

    const reportCount = new Map<string, number>();
    for (const row of reportRows) {
      reportCount.set(row.card_id, (reportCount.get(row.card_id) ?? 0) + 1);
    }
    const { data: stored } = await db
      .from("dp_cards")
      .select("id, nickname, theme, visible, status, storage_path, created_at")
      .order("created_at", { ascending: false })
      .limit(80);
    wallCards = await Promise.all(
      (stored ?? []).map(async (card) => ({
        id: card.id,
        nickname: card.nickname,
        theme: card.theme,
        visible: card.visible,
        status: card.status,
        imageUrl: await signedUrl(card.storage_path),
        createdAt: card.created_at,
        reportCount: reportCount.get(card.id) ?? 0,
      })),
    );
  }

  // Who the admins are (PHASE23 §E). Read separately from `users` because
  // that list is capped and newest-first — an admin who signed up long ago
  // must still show up here, and the count of admins has to be the REAL count
  // for the "last admin" screen state to be right.
  const { data: adminRows } = await db
    .from("organisers")
    .select("user_id, added_at")
    .order("added_at", { ascending: true });
  const adminIds = (adminRows ?? []).map((row) => row.user_id);
  const { data: adminProfiles } = adminIds.length
    ? await db
        .from("profiles")
        .select("id, display_name, email")
        .in("id", adminIds)
    : { data: [] };
  const profileById = new Map((adminProfiles ?? []).map((p) => [p.id, p]));
  const admins = (adminRows ?? []).map((row) => ({
    id: row.user_id,
    displayName: profileById.get(row.user_id)?.display_name ?? null,
    email: profileById.get(row.user_id)?.email ?? null,
    addedAt: row.added_at,
  }));

  // Day-of volunteers (ADR 0079). Before migration 0032 the table does not
  // exist; that reads as "none yet" rather than breaking the dashboard.
  const { data: volunteerRows, error: volunteerError } = await db
    .from("volunteers")
    .select("user_id, added_at, expires_at")
    .order("added_at", { ascending: true });
  if (volunteerError) {
    console.error("[admin] volunteers read failed", volunteerError.message);
  }
  const volunteerIds = (volunteerRows ?? []).map((row) => row.user_id);
  const { data: volunteerProfiles } = volunteerIds.length
    ? await db
        .from("profiles")
        .select("id, display_name, email")
        .in("id", volunteerIds)
    : { data: [] };
  const volunteerProfile = new Map(
    (volunteerProfiles ?? []).map((p) => [p.id, p]),
  );
  const volunteers = (volunteerRows ?? []).map((row) => ({
    id: row.user_id,
    displayName: volunteerProfile.get(row.user_id)?.display_name ?? null,
    email: volunteerProfile.get(row.user_id)?.email ?? null,
    addedAt: row.added_at,
    expiresAt: row.expires_at,
  }));

  const ticketRows = tickets.data ?? [];
  const intentRows = intents.data ?? [];

  return {
    organiserEmail: organiser.email,
    organiserAvatarUrl: organiser.avatarUrl,
    organiserName: organiser.name,
    organiserId: organiser.userId,
    admins,
    volunteers,
    counts: {
      paidTickets: tickets.count ?? ticketRows.length,
      checkedIn: ticketRows.filter((t) => t.checked_in_at).length,
      orders: orders.count ?? 0,
      /*
       * `activated` IS the settled state. There is no "paid" status — the
       * intent moves to `activated` inside `apply_paid_deposit`, once the
       * money landed AND the tickets or order were created. Filtering on
       * "paid" (the obvious guess) matches nothing, so this headline would
       * have read 0 XAF forever and looked plausible doing it.
       *
       * `net_amount` rather than `charged_amount`: what the chapter actually
       * earns — after the discount, and (PHASE22 §D+) BEFORE the 1.5%
       * transaction fee, which is real money the buyer pays but not real
       * ticket/product revenue. `charged_amount` is what PawaPay actually
       * settles; `net_amount` is what this headline should count.
       */
      settledRevenue: intentRows
        .filter((i) => i.status === "activated")
        .reduce((sum, i) => sum + (i.net_amount ?? 0), 0),
      wallPending,
      wallApproved,
      users: users.count ?? 0,
    },
    reservations: commerceInputs.reservations,
    pitchVote,
    pitchVoters,
    sessionInterest: {
      total: interest.reduce((n, r) => n + r.interested, 0),
      rows: interest,
    },
    commerce: commerceRecap({
      tiers,
      products,
      tickets: commerceInputs.tickets,
      orders: commerceInputs.orders,
      refunded: commerceInputs.refunded,
      reservations: commerceInputs.reservations,
    }),
    apparel: apparelTotals(
      apparelRows,
      tiers.filter((t) => t.includesApparel).map((t) => t.id),
    ),
    tickets: {
      total: tickets.count ?? ticketRows.length,
      rows: ticketRows.map((t) => ({
        id: t.id,
        badgeCode: t.badge_code,
        attendeeName: t.attendee_name,
        attendeeEmail: t.attendee_email,
        tierId: t.tier_id,
        apparelSize: t.apparel_size,
        checkedInAt: t.checked_in_at,
        createdAt: t.created_at,
      })),
    },
    orders: {
      total: orders.count ?? 0,
      rows: (orders.data ?? []).map((o) => ({
        id: o.id,
        status: o.status,
        totalAmount: o.total_amount,
        currency: o.currency,
        createdAt: o.created_at,
        fulfilment: o.fulfilment,
        items: (o.order_items ?? []).map((i) => ({
          productId: i.product_id,
          // `name_snapshot` is a JSON column (it stores the bilingual name at
          // the time of sale), so it needs coercing before it reaches a table.
          name:
            typeof i.name_snapshot === "string"
              ? i.name_snapshot
              : JSON.stringify(i.name_snapshot),
          quantity: i.quantity,
          unitAmount: i.unit_amount,
          variant: i.variant,
        })),
      })),
    },
    transactions: {
      total: intents.count ?? intentRows.length,
      rows: intentRows.map((i) => ({
        depositId: i.deposit_id,
        kind: i.kind,
        status: i.status,
        chargedAmount: i.charged_amount,
        netAmount: i.net_amount,
        discountCode: i.discount_code,
        discountAmount: i.discount_amount,
        currency: i.currency,
        failureCode: i.failure_code,
        createdAt: i.created_at,
      })),
    },
    users: {
      total: users.count ?? 0,
      rows: (users.data ?? []).map((u) => ({
        id: u.id,
        displayName: u.display_name,
        email: u.email,
        createdAt: u.created_at,
      })),
    },
    discounts: (discounts.data ?? []).map((d) => ({
      code: d.code,
      kind: d.kind,
      value: d.value,
      appliesTo: d.applies_to,
      active: d.active,
      redeemedCount: d.redeemed_count,
      maxRedemptions: d.max_redemptions,
      expiresAt: d.expires_at,
    })),
    refundRequests: {
      total: refundRequests.count ?? refundRequests.data?.length ?? 0,
      rows: (refundRequests.data ?? []).map((r) => ({
        id: r.id,
        kind: r.kind as "tickets" | "shop",
        reference: r.reference,
        requesterName: r.requester_name,
        requesterEmail: r.requester_email,
        reason: r.reason,
        status: r.status as "requested" | "in_progress" | "resolved" | "denied",
        notes: r.notes,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        resolvedAt: r.resolved_at,
      })),
    },
    wallEnabled,
    wallReports,
    wallCards,
  };
}
