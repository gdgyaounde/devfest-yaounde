/**
 * The dashboard's data shape, and nothing that can touch a database.
 *
 * Split from `data.ts` because that module is `server-only` and pulls in the
 * Supabase service-role client. A view importing a plain CONSTANT from it —
 * `LIST_CAP`, to print "showing 500 of 812" — was enough to drag the whole
 * server client into the browser bundle, which the build rightly refused.
 * Types alone would have been fine, since they are erased; a value is not.
 */
/**
 * How many rows a list view loads.
 *
 * The dashboard is one server render, so this is a real ceiling rather than a
 * page size — and the UI says "showing N of M" rather than implying it has
 * everything. For a first DevFest this is the whole dataset several times
 * over; past that, these become paginated queries.
 */
export const LIST_CAP = 500;

export interface AdminTicket {
  id: string;
  badgeCode: string;
  attendeeName: string;
  attendeeEmail: string;
  tierId: string;
  apparelSize: string | null;
  checkedInAt: string | null;
  createdAt: string;
}

export interface AdminOrder {
  id: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  fulfilment: unknown;
  items: {
    /** Also `tickets.tier_id` for a ticket line — same column, both catalogs. */
    productId: string;
    name: string;
    quantity: number;
    unitAmount: number;
    variant: unknown;
  }[];
}

export interface AdminTransaction {
  depositId: string;
  kind: string;
  status: string;
  chargedAmount: number;
  netAmount: number;
  discountCode: string | null;
  discountAmount: number | null;
  currency: string;
  failureCode: string | null;
  createdAt: string;
}

/**
 * A manually-logged refund/exchange request — a visibility tracker, not a
 * money-moving system. See `lib/admin/refund-lifecycle.ts` and PHASE22 §D.
 */
export interface AdminRefundRequest {
  id: string;
  kind: "tickets" | "shop";
  reference: string;
  requesterName: string;
  requesterEmail: string;
  reason: string;
  status: "requested" | "in_progress" | "resolved" | "denied";
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface AdminUser {
  id: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
}

/** Somebody in the `organisers` table — an admin (PHASE23 §E). */
export interface AdminAdmin {
  id: string;
  displayName: string | null;
  email: string | null;
  addedAt: string;
}

export interface AdminDiscount {
  code: string;
  kind: string;
  value: number;
  appliesTo: string;
  active: boolean;
  redeemedCount: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
}

export interface AdminWallReport {
  id: string;
  cardId: string;
  nickname: string;
  status: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface AdminWallCard {
  id: string;
  nickname: string;
  theme: string;
  visible: boolean;
  status: string;
  imageUrl: string | null;
  createdAt: string;
  reportCount: number;
}

export interface MissingPhoto {
  collection: string;
  collectionLabel: string;
  id: string;
  name: string;
}

/** How the speakers surface decides between a lineup and an invitation. */
export type CfsOverride = "auto" | "force-on" | "force-off";

export interface CfsSettings {
  url: string;
  /** ISO instants, or null for "no window" — the call is simply open. */
  opensAt: string | null;
  closesAt: string | null;
  override: CfsOverride;
}

export interface SponsorCallSettings {
  prospectusUrl: string;
  /** Whether the "become a sponsor" CTA is still up. */
  enabled: boolean;
  closesAt: string | null;
}

export interface LegalSettings {
  participationTermsUrl: string;
  privacyUrl: string;
  termsUrl: string;
}

export interface HeroSettings {
  /**
   * The landing hero's backdrop. Empty is a real, supported state — the hero
   * falls back to the themed ground, which is also what shows through a
   * transparent image.
   */
  imageUrl: string;
}

export interface CapacitySettings {
  /** Overall event capacity, for the public counter. Null = no public counter. */
  total: number | null;
}

export interface MemoryLaneSettings {
  /** Past edition's photo album. Empty hides the link. */
  galleryUrl: string;
  /** This edition's album — see the schema doc comment for how it is used. */
  currentGalleryUrl: string;
}

import type { NavSettings } from "@/lib/nav-tabs";

export interface AdminSettings {
  eventDate: string;
  announcement: { fr: string; en: string } | null;
  bevyUrl: string;
  hero: HeroSettings;
  cfs: CfsSettings;
  sponsorCall: SponsorCallSettings;
  legal: LegalSettings;
  capacity: CapacitySettings;
  memoryLane: MemoryLaneSettings;
  /** Which navbar tabs are shown (PHASE24). */
  nav: NavSettings;
  source: "database" | "repo";
}

export interface AdminData {
  organiserEmail: string | null;
  /** Google profile picture — only ever a vetted Google-hosted https URL. */
  organiserAvatarUrl: string | null;
  organiserName: string | null;
  /** The signed-in admin's own id — so the screen can tell "you" apart. */
  organiserId: string;
  /** Every current admin, oldest first. */
  admins: AdminAdmin[];
  counts: {
    paidTickets: number;
    checkedIn: number;
    orders: number;
    settledRevenue: number;
    wallPending: number;
    wallApproved: number;
    users: number;
  };
  tickets: { rows: AdminTicket[]; total: number };
  orders: { rows: AdminOrder[]; total: number };
  transactions: { rows: AdminTransaction[]; total: number };
  users: { rows: AdminUser[]; total: number };
  discounts: AdminDiscount[];
  refundRequests: { rows: AdminRefundRequest[]; total: number };
  wallEnabled: boolean;
  wallReports: AdminWallReport[];
  wallCards: AdminWallCard[];
}
