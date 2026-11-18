import "server-only";
import { loadProducts, loadTiers } from "@/lib/payments/catalog";
import type { StaffReservation } from "@/lib/staff/results";

/** The columns the door reads — never the phone or the email (ADR 0084). */
export const RESERVATION_COLUMNS =
  "id, reference, status, contact_name, tickets, items, total_xaf, cash_received_at, checked_in_at";

export async function toStaffReservations(
  rows: {
    id: string;
    reference: string;
    status: string;
    contact_name: string;
    tickets: unknown;
    items: unknown;
    total_xaf: number;
    cash_received_at: string | null;
    checked_in_at: string | null;
  }[],
): Promise<StaffReservation[]> {
  const [tiers, products] = await Promise.all([loadTiers(), loadProducts()]);
  const tierName = new Map(tiers.map((t) => [t.id, t.name]));
  const productName = new Map(products.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    name: r.contact_name,
    status: r.status as StaffReservation["status"],
    totalXaf: r.total_xaf,
    tickets: (
      r.tickets as { tierId: string; name: string; apparelSize?: string }[]
    ).map((t) => ({
      tierName: tierName.get(t.tierId) ?? t.tierId,
      name: t.name,
      ...(t.apparelSize ? { apparelSize: t.apparelSize } : {}),
    })),
    items: (
      r.items as {
        productId: string;
        quantity: number;
        variant?: { size?: string; color?: string };
      }[]
    ).map((i) => ({
      name: productName.get(i.productId) ?? i.productId,
      quantity: i.quantity,
      ...(i.variant ? { variant: i.variant } : {}),
    })),
    cashReceivedAt: r.cash_received_at,
    checkedInAt: r.checked_in_at,
  }));
}
