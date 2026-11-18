/**
 * What the reservation routes answer (ADR 0084). Client-safe: types only.
 */
export type ReservationStatus = "reserved" | "cash_received" | "cancelled";

export interface ReservationTicket {
  tierId: string;
  /** The attendee. */
  name: string;
  apparelSize?: string;
  /** The tier's display name, resolved when listing. */
  tierName?: string;
}

export interface ReservationItem {
  productId: string;
  quantity: number;
  variant?: { size?: string; color?: string };
  /** The product's bilingual name, resolved when listing. */
  productName?: { fr: string; en: string };
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
