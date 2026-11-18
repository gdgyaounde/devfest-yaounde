/**
 * /api/reservations — reserve now, pay cash at the venue (ADR 0084).
 *
 *   POST  { contact, tickets[], items[], acceptedCash: true, locale }
 *         → 201 { id, reference, totalXaf }
 *   GET   → { reservations: MyReservation[] }   (the caller's own)
 *
 * Nothing here takes a payment, or a price from the client: lines are checked
 * and priced against the server catalog at BASE price (cash has no online
 * fee). Open only while `salesPhase === "reserving"` — after the payments
 * cutoff and before the reservations deadline. The capacity check and the
 * per-account cap run in the database under one lock (`create_reservation`),
 * so two people cannot take the last seats.
 *
 * Fails CLOSED: if migration 0034 isn't applied the RPC doesn't exist, the
 * route answers 503 `reservations_unavailable` and writes nothing.
 */
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/admin/audit";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { loadSettings } from "@/lib/content/settings";
import { salesPhase } from "@/lib/event";
import { loadProducts, loadTiers } from "@/lib/payments/catalog";
import {
  MAX_ACTIVE_RESERVATIONS,
  priceReservation,
  referenceFrom,
  reservationGate,
  reservationSchema,
  ReservationError,
  RESERVATION_ERRORS,
} from "@/lib/reservations/rules";
import type { MyReservation } from "@/lib/reservations/types";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitIdentity,
} from "@/lib/security/rate-limit";
import { createAdminSupabase, currentUser } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const fail = (error: string, status: number, extra: object = {}) =>
  Response.json({ error, ...extra }, { status, headers: NO_STORE });

export async function POST(request: NextRequest) {
  // A write that carries someone's phone number: refuse other origins first.
  if (
    !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
  ) {
    return fail("cross_origin", 403);
  }
  const user = await currentUser();
  if (!user) return fail("unauthenticated", 401);

  const limit = await rateLimit(
    RATE_LIMITS.reservation,
    rateLimitIdentity(user.id, request.headers),
  );
  if (!limit.allowed) {
    return fail("rate_limited", 429, { retryAfter: limit.retryAfterSeconds });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body", 400);
  }
  const parsed = reservationSchema.safeParse(body);
  if (!parsed.success) return fail("invalid_body", 400);
  const input = parsed.data;

  const settings = await loadSettings();
  const gate = reservationGate(salesPhase(new Date(), settings));
  if (gate) return fail(gate, 409);

  let priced;
  try {
    const [tiers, products] = await Promise.all([loadTiers(), loadProducts()]);
    priced = priceReservation(input, tiers, products);
  } catch (err) {
    if (err instanceof ReservationError) return fail(err.code, err.status);
    console.error("[reservations] pricing failed", err);
    return fail("server_error", 500);
  }

  const supabase = createAdminSupabase();
  // A reference collision (1 in a billion) is retried a few times.
  for (let attempt = 0; attempt < 4; attempt++) {
    const reference = referenceFrom(randomBytes(6));
    const { data, error } = await supabase.rpc("create_reservation", {
      p_user_id: user.id,
      p_reference: reference,
      p_contact_name: input.contact.name,
      p_contact_phone: input.contact.phone,
      p_contact_email: input.contact.email ?? "",
      p_tickets: priced.tickets,
      p_items: priced.items,
      p_total_xaf: priced.totalXaf,
      p_caps: priced.caps,
      p_max_active: MAX_ACTIVE_RESERVATIONS,
    });
    if (error) {
      // Includes "function does not exist" before migration 0034 is applied.
      console.error("[reservations] create failed", error.message);
      return fail("reservations_unavailable", 503);
    }
    const result = data as {
      status: "ok" | "tier_full" | "too_many" | "reference_taken";
      id?: string;
      reference?: string;
      tierId?: string;
    };
    if (result.status === "reference_taken") continue;
    if (result.status === "tier_full") {
      return fail(RESERVATION_ERRORS.TIER_FULL, 409, { tierId: result.tierId });
    }
    if (result.status === "too_many") {
      return fail(RESERVATION_ERRORS.TOO_MANY, 409);
    }
    await recordAudit({
      actor: user.id,
      action: "reservation.create",
      target: reference,
      after: {
        tickets: priced.tickets.length,
        items: priced.items.length,
        totalXaf: priced.totalXaf,
      },
    });
    return Response.json(
      { id: result.id, reference, totalXaf: priced.totalXaf },
      { status: 201, headers: NO_STORE },
    );
  }
  return fail("server_error", 500);
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("unauthenticated", 401);
  const limit = await rateLimit(
    RATE_LIMITS.reservationRead,
    rateLimitIdentity(user.id, request.headers),
  );
  if (!limit.allowed) return fail("rate_limited", 429);

  const { data, error } = await createAdminSupabase()
    .from("reservations")
    .select(
      "id, reference, status, tickets, items, total_xaf, created_at, cash_received_at, checked_in_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    // Before migration 0034 the table does not exist: nothing reserved yet.
    console.error("[reservations] list failed", error.message);
    return Response.json({ reservations: [] }, { headers: NO_STORE });
  }
  const reservations: MyReservation[] = (data ?? []).map((r) => ({
    id: r.id,
    reference: r.reference,
    status: r.status as MyReservation["status"],
    tickets: r.tickets as unknown as MyReservation["tickets"],
    items: r.items as unknown as MyReservation["items"],
    totalXaf: r.total_xaf,
    createdAt: r.created_at,
    cashReceivedAt: r.cash_received_at,
    checkedInAt: r.checked_in_at,
  }));
  return Response.json({ reservations }, { headers: NO_STORE });
}
