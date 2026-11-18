/**
 * What the reservation routes answer (ADR 0084). Client-safe: types only.
 */
export type ReservationStatus = "reserved" | "cash_received" | "cancelled";

export interface ReservationTicket {
  tierId: string;
  name: string;
  apparelSize?: string;
}

export interface ReservationItem {
  productId: string;
  quantity: number;
  variant?: { size?: string; color?: string };
}

/** A reservation as its OWNER sees it (their own name, phone and lines). */
export interface MyReservation {
  id: string;
  reference: string;
  status: ReservationStatus;
  tickets: ReservationTicket[];
  items: ReservationItem[];
  totalXaf: number;
  createdAt: string;
  cashReceivedAt: string | null;
  checkedInAt: string | null;
}
