/**
 * Data shapes for src/data/*.json — mirrors the devfest-content-model skill.
 * See .claude/skills/devfest-content-model/SKILL.md for the source of truth.
 */

export type LocalizedString = { fr: string; en: string };

export interface Speaker {
  id: string;
  name: string;
  role: LocalizedString;
  company: string;
  photoUrl: string;
  bio: LocalizedString;
  /** Primary track — drives the /speakers filter. */
  track: LocalizedString;
  /** Event day they appear on — drives the /speakers filter. */
  day: number;
  sessionIds: string[];
  social?: { x?: string; linkedin?: string; website?: string };
  /** Casual interview-style question shown in the detail reveal. */
  icebreakerQuestion: LocalizedString;
  /** Their short answer to it — brand-voice personality, not a data row. */
  icebreakerAnswer: LocalizedString;
  /** Optional short, shareable funny note. Omit rather than leaving blank. */
  funnyMoment?: LocalizedString;
  /** true = shown in the Home preview slider. */
  featured?: boolean;
  /**
   * Hidden from the public site, but kept.
   *
   * Somebody who has withdrawn, is not announced yet, or should come off the
   * page for a while. The alternative was deleting them and typing everything
   * back in later, which is how records get lost.
   *
   * Optional, and absent means visible — so every record written before this
   * existed is still valid and still shown.
   */
  hidden?: boolean;
}

/**
 * A speaker as the PROFILE renders it: the stored record plus their sessions,
 * resolved on the server from `sessionIds` (ADR 0073). Display-only — never
 * written back to the store.
 */
export type SpeakerWithTalks = Speaker & { talks?: Session[] };

export interface TeamMember {
  id: string;
  name: string;
  role: LocalizedString;
  /**
   * Personality-forward one-liner, not a formal bio (PAGES.md §6).
   *
   * Optional: a real organiser's words are theirs to write. See the note on
   * `teamSchema` — the alternative was inventing a sentence and putting a
   * named person's face next to it.
   */
  oneLiner?: LocalizedString;
  /**
   * What they actually do for the event (Organising, Sponsoring, Ushering,
   * Design, Logistics, Programme…). This doubles as the grouping/filter axis
   * on /team — we group by contribution rather than an invented sub-team org
   * chart, which was never confirmed. See docs/decisions/0010-team-grouping.md.
   */
  contribution: LocalizedString;
  photoUrl: string;
  social?: { x?: string; linkedin?: string; website?: string };
  /** Casual interview-style question shown in the detail reveal. Optional. */
  icebreakerQuestion?: LocalizedString;
  /** Their short answer to it. Optional, for the same reason. */
  icebreakerAnswer?: LocalizedString;
  /**
   * Up to 3 short expertise / interest tags — "Frontend", "Community",
   * "Design" (PHASE23 §B). Bilingual per tag, rendered as `Badge` chips.
   * Optional for the same reason as the personality beats: the list is
   * theirs, and nothing here invents one.
   */
  expertise?: LocalizedString[];
  /**
   * The year they joined GDG Yaoundé ("With GDG since 2022"). Language-
   * neutral, so a plain number. Optional.
   */
  gdgSince?: number;
  /** Optional short, shareable funny note. */
  funnyMoment?: LocalizedString;
  /** true = rendered in the Alumni / Past Organizers section. */
  alumni?: boolean;
  /** Year(s) they organised — alumni only. */
  years?: string;
  /**
   * Hidden from the public site, but kept.
   *
   * Somebody who has withdrawn, is not announced yet, or should come off the
   * page for a while. The alternative was deleting them and typing everything
   * back in later, which is how records get lost.
   *
   * Optional, and absent means visible — so every record written before this
   * existed is still valid and still shown.
   */
  hidden?: boolean;
}

/**
 * Ascending — Haikyu is the entry paid tier, Mythos the top, matching the
 * ticket tiers' own naming exactly (a deliberate shared scheme across two
 * separate entities, not a coincidence). `community` and `partner` are the
 * two non-monetary options, kept from the original scheme. See ADR on the
 * sponsor tier rename for the migration from the old platinum/gold/silver
 * naming.
 */
export const SPONSOR_TIERS = [
  "haikyu",
  "sonnet",
  "opus",
  "fable",
  "mythos",
  "community",
  "partner",
] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string;
  /** `partner` is a tier rather than a separate entity — see `sponsorSchema`. */
  tier?: SponsorTier;
  websiteUrl?: string;
  /**
   * Short line for the cursor-reveal popup (desktop) and its inline fallback
   * (touch/reduced motion) — see `SponsorStrip`. Optional: a sponsor with
   * none still gets the popup, just with only their name in it.
   */
  blurb?: LocalizedString;
}

export interface Stat {
  id: string;
  /** Whole and non-negative — drawn by the digit odometer. */
  value: number;
  suffix?: string;
  label: LocalizedString;
  /**
   * Optional picture for the figure. Desktop: it becomes the cursor while
   * hovering the number. Touch or reduced motion: shown inline beside it.
   */
  imageUrl?: string;
}

export interface Quote {
  id: string;
  text: LocalizedString;
  /**
   * Empty when the speaker is not known by name — the site then shows a
   * localized "Community member" instead of inventing one.
   */
  author: string;
  /** e.g. "Attendee, past edition" or a role + company. */
  role?: LocalizedString;
  /** Optional face. Uploaded from the dashboard. */
  avatarUrl?: string;
  /** Absent means visible. */
  hidden?: boolean;
}

export interface PastEditionPhoto {
  id: string;
  imageUrl: string;
  alt: LocalizedString;
  year?: number;
}

/**
 * A schedule session. Shaped so the Home preview and the full /schedule
 * route share one component and one record type (devfest-content-model).
 */
export type SessionKind = "talk" | "workshop" | "panel" | "break";

/** Sessionize's four levels, as stored. Rendered through i18n. */
export type SessionLevel =
  "introductory" | "intermediate" | "advanced" | "expert";

/** A language a session is given in. */
export type SessionLanguage = "fr" | "en";

export interface Session {
  id: string;
  /**
   * "HH:mm" — local event time. ABSENT = not scheduled yet (ADR 0073): the
   * session is accepted and announced, but has no slot. The schedule lists
   * it under "time slots coming soon" instead of inventing a time, and it
   * gets no add-to-calendar links.
   */
  time?: string;
  /** Minutes; drives the displayed duration. Absent until it is known. */
  durationMin?: number;
  day: number;
  kind: SessionKind;
  /**
   * A short-format talk (Sessionize "Lightning talk"). `kind` stays "talk";
   * this keeps "lightning" visible as its own chip and groups it on the
   * unscheduled programme.
   */
  lightning?: boolean;
  /** Given remotely (Sessionize "Online") — shown as an "Online" marker. */
  online?: boolean;
  level?: SessionLevel;
  /** Languages the session is given in, in the speaker's order. */
  language?: SessionLanguage[];
  /**
   * The language the speaker WROTE the title and description in, when they
   * submitted only one. Those fields then carry the same text on both sides
   * (they are not machine-translated — devfest-i18n), and the card says
   * "original text in English" on the other locale's page.
   */
  originalLanguage?: SessionLanguage;
  title: LocalizedString;
  description: LocalizedString;
  track: LocalizedString;
  /** Absent until the session is given a room. */
  room?: LocalizedString;
  /** Free-form tags rendered as Badges. */
  tags: LocalizedString[];
  /** e.g. "bring a laptop" — only rendered when present. */
  bring?: LocalizedString;
  /** e.g. "we provide the boards" — only rendered when present. */
  provided?: LocalizedString;
  /** Ids into speakers.json; empty for breaks. */
  speakerIds: string[];
}

export interface FaqItem {
  id: string;
  category: "general" | "tickets" | "venue" | "shop" | "code-of-conduct";
  question: LocalizedString;
  answer: LocalizedString;
  /**
   * Optional call to action on the answer (PHASE10 §8) — "See ticket tiers",
   * "Read the code of conduct". Per-ITEM rather than per-category: the useful
   * next step differs between two questions in the same category, and the
   * old category-wide link appended "See tickets" to answers that had
   * nothing to do with buying one.
   *
   * `href` is an internal route (passed to the locale-aware `Link`) unless
   * `external` is set, in which case it is a plain absolute URL.
   */
  cta?: {
    label: LocalizedString;
    href: string;
    external?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Commerce (feat/tickets-flow, feat/shop-flow)
//
// Prices live here, in JSON, and NOWHERE else. The checkout routes recompute
// every total from these files — a price arriving in a request body is always
// ignored. See docs/decisions/0013-payments-pawapay.md.
// ---------------------------------------------------------------------------

/** Apparel sizes offered on tiers/products that include clothing. */
export type ApparelSize = "XS" | "S" | "M" | "L" | "XL" | "XXL";

/** One thing a ticket grants — rendered as a checked entitlement row. */
export interface TierEntitlement {
  label: LocalizedString;
  /** Phosphor icon name from the admin's fixed whitelist. Optional. */
  icon?: string;
  note?: LocalizedString;
}

/** A swag item bundled with a tier, optionally linked to its own shop listing. */
export interface TicketTier {
  id: string;
  /** Proper-noun tier name, rendered mono-tag style. Language-neutral. */
  name: string;
  /**
   * Optional sub-title beside the name ("Free pass"). Empty strings for
   * tiers whose name says enough on its own.
   */
  label?: LocalizedString;
  /** Whole XAF. 0 = free tier, which skips the payment provider entirely. */
  priceXAF: number;
  /**
   * The CASH price at the venue, from the payments cutoff on (ADR 0084). No
   * online fee applies, and it may differ from `priceXAF` (which stays what
   * is charged online until then). Absent = same as `priceXAF`.
   */
  venuePriceXAF?: number;
  /**
   * True when this tier is NOT sold here at all: the RSVP is delegated to the
   * community platform, which already enforces one free RSVP per person.
   * Such a tier shows an outbound CTA instead of a quantity selector, and
   * never touches checkout or sign-in.
   */
  rsvpExternal?: boolean;
  /**
   * Swag bundled with this tier, as SHOP PRODUCT IDS (ADR 0054).
   *
   * A reference, never ownership: the tier points at listings the Shop
   * already holds. Ordered as the admin arranged them — the preview renders
   * in this order. Ids that no longer resolve are skipped at render.
   */
  swagProductIds?: string[];
  description: LocalizedString;
  /** "What your ticket grants you" — admin-editable, reorderable. */
  perks: TierEntitlement[];
  /** When true, attendee details must collect an apparel size. */
  includesApparel: boolean;
  /** Omit for unlimited. Checked server-side at checkout. */
  quantityAvailable?: number;
  /** Hidden from the tier list when false — kept so past tiers stay resolvable. */
  onSale: boolean;
  /**
   * Explicit sold-out flag, independent of `quantityAvailable` — an admin
   * can pull a tier off sale for reasons the counter doesn't know about.
   * Checked server-side at checkout alongside capacity.
   */
  soldOut?: boolean;
}

export type ProductStatus =
  "pre-order" | "in-stock" | "venue-only" | "sold-out";

export interface Product {
  id: string;
  name: LocalizedString;
  description: LocalizedString;
  priceXAF: number;
  /** The CASH price at the venue from the payments cutoff on (ADR 0084). Absent = `priceXAF`. */
  venuePriceXAF?: number;
  images: string[];
  variants?: { size?: ApparelSize[]; color?: string[] };
  /**
   * Per-combination stock. Omit the whole field for unlimited, and omit a
   * single combination to leave that one unlimited.
   *
   * Declared here, counted in the database — the same split as ticket tiers:
   * an organiser changes a number in this file, and the server counts what
   * has actually been sold against it. See ADR 0024.
   */
  stock?: Array<{ size?: string; color?: string; quantity: number }>;
  /** Always paired with a visible text label in the UI, never colour alone. */
  status: ProductStatus;
  /**
   * Absent or true = live on the public shop. False = hidden — an admin
   * still working on a listing, or one deliberately pulled from sale.
   * Toggleable straight from the Shop listing row (ADR 0055).
   */
  published?: boolean;
  /**
   * Comes WITH a ticket and is never sold alone — a certificate, say.
   * Shown as swag on the tiers that bundle it; not listed in the shop, no
   * product page, not in the sitemap, and refused at checkout. Absent = a
   * normal shop product. A `published: false` product stays hidden everywhere
   * regardless. See `lib/content/product-visibility.ts`.
   */
  ticketOnly?: boolean;
}

/** One chosen product + variant + quantity, as sent by the shop checkout. */
export interface CartLine {
  productId: string;
  quantity: number;
  variant?: { size?: string; color?: string };
}

/** One attendee on a ticket order. Apparel size only for apparel tiers. */
export interface AttendeeInput {
  tierId: string;
  name: string;
  email: string;
  apparelSize?: ApparelSize;
  /** The buyer kept this one. Recorded on the ticket — see ADR 0025. */
  isSelf?: boolean;
}

/**
 * A priced basket, computed server-side. `net` is what the community actually
 * banks once the discount is applied; `charged` is what the buyer pays. They
 * differ only when a discount is in play, but both are persisted so the
 * callback can check the charged figure while accounting reads the net one.
 */
export interface PricedBasket {
  lines: PricedLine[];
  /** Base subtotal — the sum of stored, fee-free catalog prices. */
  subtotal: number;
  discountCode?: string;
  /** Computed against the BASE subtotal, before the fee is added. */
  discountAmount: number;
  /**
   * The 1.5% transaction fee (`lib/payments/fees.ts`), applied once to the
   * post-discount base amount — never to `subtotal` directly, and never
   * split across lines. `charged = net + feeAmount`.
   */
  feeAmount: number;
  /** What is actually charged — fee-inclusive. The number PawaPay is asked
   *  for, and the number shown as the total everywhere on the site. */
  charged: number;
  /** Base, post-discount, pre-fee — what the event itself actually earns. */
  net: number;
  currency: "XAF";
}

export interface PricedLine {
  /** Tier id for tickets, product id for shop. */
  productId: string;
  name: LocalizedString;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  variant?: { size?: string; color?: string };
}
