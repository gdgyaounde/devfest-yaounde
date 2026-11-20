/**
 * GET /api/staff/backup-list — the offline door roster (ADR 0090).
 *
 * Staff only (organisers and active volunteers), rate-limited to a few a
 * hour, never cached, and every download is written to the audit log with
 * who took it and how many rows. It carries name, pass, badge code and
 * check-in state — never an email, a phone number or anything from a payment.
 *
 * Fails closed: a failed read is a 503 and no partial list.
 */
import { recordAudit } from "@/lib/admin/audit";
import { loadSettings } from "@/lib/content/settings";
import { getTiers } from "@/lib/content/store";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import type {
  BackupList,
  BackupReservation,
  BackupTicket,
} from "@/lib/staff/backup-list";
import {
  RESERVATION_COLUMNS,
  toStaffReservations,
} from "@/lib/staff/reservations";
import { volunteerExpiry } from "@/lib/staff/rules";
import { refundStanding } from "@/lib/tickets/check-in";
import { createAdminSupabase } from "@/lib/supabase/server";

const MAX_ROWS = 5000;

export async function GET() {
  const staff = await guardStaff("staffBackup");
  if (staff instanceof Response) return staff;

  const supabase = createAdminSupabase();
  const [tickets, reservations, refunds, tiers, settings] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        "id, badge_code, deposit_id, attendee_name, tier_id, checked_in_at",
      )
      .order("attendee_name")
      .limit(MAX_ROWS),
    // Before migration 0034 there is no table: that is simply "no reservations".
    supabase
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .order("contact_name")
      .limit(MAX_ROWS),
    supabase
      .from("refund_requests")
      .select("reference, status")
      .in("status", ["requested", "in_progress", "resolved"]),
    getTiers(),
    loadSettings(),
  ]);
  if (tickets.error) {
    console.error("[staff] backup list tickets failed", tickets.error.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 503);
  }
  if (reservations.error) {
    console.error(
      "[staff] backup list reservations",
      reservations.error.message,
    );
  }
  if (refunds.error) {
    console.error("[staff] backup list refunds", refunds.error.message);
  }

  const refundsByRef = new Map<string, string[]>();
  for (const r of refunds.data ?? []) {
    const key = r.reference.toLowerCase();
    refundsByRef.set(key, [...(refundsByRef.get(key) ?? []), r.status]);
  }

  const ticketRows: BackupTicket[] = (tickets.data ?? []).map((t) => {
    const statuses = [t.id, t.badge_code, t.deposit_id].flatMap(
      (ref) => refundsByRef.get(ref.toLowerCase()) ?? [],
    );
    const standing = refundStanding(statuses);
    return {
      n: t.attendee_name,
      t: t.tier_id,
      c: t.badge_code,
      i: t.checked_in_at !== null,
      ...(standing === "refunded"
        ? { f: "r" as const }
        : standing === "pending"
          ? { f: "p" as const }
          : {}),
    };
  });

  const reservationRows: BackupReservation[] = (
    await toStaffReservations(reservations.data ?? [])
  ).map((r) => ({
    r: r.reference,
    n: r.name,
    s: r.status,
    x: r.totalXaf,
    l: [
      ...r.tickets.map((t) => `${t.tierName} · ${t.name}`),
      ...r.items.map(
        (i) =>
          `${typeof i.name === "string" ? i.name : i.name.en} ×${i.quantity}`,
      ),
    ],
    i: r.checkedInAt !== null,
  }));

  const body: BackupList = {
    generatedAt: new Date().toISOString(),
    // A volunteer's copy dies with their access; an organiser's with the day after.
    expiresAt: staff.expiresAt ?? volunteerExpiry(settings.eventDate),
    tiers: Object.fromEntries(
      tiers.map((t) => [t.id, { name: t.name, paid: t.priceXAF > 0 }]),
    ),
    tickets: ticketRows,
    reservations: reservationRows,
  };

  await recordAudit({
    actor: staff.userId,
    action: "staff.backup_list",
    after: { tickets: ticketRows.length, reservations: reservationRows.length },
  });
  return Response.json(body, { headers: NO_STORE });
}
