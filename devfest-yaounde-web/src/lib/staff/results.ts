/**
 * What the day-of staff routes answer (ADR 0079). Shared by the routes and
 * the station screens; client-safe (types only).
 */
import type { PerkKind } from "@/lib/staff/rules";

/** What a station needs to know about a pass: its name, and if it is paid. */
export type StationTier = { name: string; paid: boolean };

/** One name-search result: what a station shows, and nothing else. */
export interface StaffTicketHit {
  id: string;
  name: string;
  tierId: string;
  checkedInAt: string | null;
  mealCollectedAt: string | null;
  swagCollectedAt: string | null;
}

type Localized = { fr: string; en: string };

export type PerkResult =
  | {
      status: "collected" | "already_collected";
      perk: PerkKind;
      attendeeName: string;
      tierId: string;
      collectedAt: string;
      /** Swag only: what goes in the bag. */
      items?: Localized[];
      /** Swag only, and only when the pass includes a shirt (null = no size on file). */
      apparelSize?: string | null;
    }
  | {
      status: "not_eligible";
      perk: PerkKind;
      attendeeName: string;
      tierId: string;
      reason: "free_pass" | "refunded" | "not_in_pass";
    }
  | { status: "not_found"; perk: PerkKind };

/** An open (or just-collected) pickup order, as the merch table sees it. */
export interface StaffOrder {
  id: string;
  ref: string;
  buyerName: string | null;
  status: string;
  items: {
    /** `order_items.name_snapshot` — bilingual JSON; a bare string on old rows. */
    name: Localized | string;
    quantity: number;
    variant: { size?: string; color?: string } | null;
  }[];
}

/**
 * A reservation as the DOOR sees it (ADR 0084): the name and what was
 * reserved, the amount owed in cash and where it stands — never the phone or
 * the email. Volunteers collect cash and tick people off; chasing is for
 * organisers, from the dashboard.
 */
export interface StaffReservation {
  id: string;
  reference: string;
  name: string;
  status: "reserved" | "cash_received" | "cancelled";
  totalXaf: number;
  tickets: { tierName: string; name: string; apparelSize?: string }[];
  items: {
    name: { fr: string; en: string } | string;
    quantity: number;
    variant?: { size?: string; color?: string };
  }[];
  cashReceivedAt: string | null;
  checkedInAt: string | null;
}

export type ReservationDoorResult =
  | { status: "ok"; reservation: StaffReservation }
  | { status: "not_found" }
  | { status: "cancelled" };
