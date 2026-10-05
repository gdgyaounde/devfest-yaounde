/**
 * Zod for every editorial collection and for site settings.
 *
 * A PUT that fails here never reaches the database. Shapes match
 * `src/data/types.ts` — the same records the public pages already render.
 */
import { z } from "zod";

const slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be a lowercase slug");

const localized = z.object({
  fr: z.string().max(4000),
  en: z.string().max(4000),
});

const localizedRequired = z.object({
  fr: z.string().trim().min(1).max(4000),
  en: z.string().trim().min(1).max(4000),
});

const social = z
  .object({
    x: z.string().max(300).optional(),
    linkedin: z.string().max(300).optional(),
    website: z.string().max(300).optional(),
  })
  .optional();

function uniqueIds<T extends { id: string }>(list: T[]): boolean {
  return new Set(list.map((row) => row.id)).size === list.length;
}

export const speakerSchema = z.object({
  id: slug,
  name: z.string().trim().min(1).max(120),
  role: localizedRequired,
  company: z.string().max(120),
  photoUrl: z.string().max(400),
  bio: localizedRequired,
  track: localizedRequired,
  day: z.number().int().min(1).max(14),
  sessionIds: z.array(slug).max(40),
  social,
  icebreakerQuestion: localizedRequired,
  icebreakerAnswer: localizedRequired,
  funnyMoment: localized.optional(),
  featured: z.boolean().optional(),
  // Absent means visible, so every payload written before this is valid.
  hidden: z.boolean().optional(),
});

export const teamSchema = z.object({
  id: slug,
  name: z.string().trim().min(1).max(120),
  role: localizedRequired,
  contribution: localizedRequired,
  photoUrl: z.string().max(400),
  social,
  /*
   * OPTIONAL, and that is the point.
   *
   * These are the personality beats — a one-liner, an icebreaker answer, a
   * funny moment. They were required while the team file held invented
   * placeholder people, which made requiring them free. Now that it holds
   * REAL organisers, requiring them would mean either writing words and
   * attributing them to a named person who never said them, or leaving the
   * team page as fiction. Neither is acceptable, so the fields wait for the
   * people they belong to. The page renders without them.
   */
  oneLiner: localized.optional(),
  icebreakerQuestion: localized.optional(),
  icebreakerAnswer: localized.optional(),
  funnyMoment: localized.optional(),
  /*
   * PHASE23 §B. Same absent-is-fine convention: a tag list and a join year
   * are theirs to supply. Capped at 3 so a card can never turn into a wall
   * of chips, and each tag is short enough to sit on one line.
   */
  expertise: z.array(localizedRequired).max(3).optional(),
  gdgSince: z.number().int().min(2000).max(2100).optional(),
  alumni: z.boolean().optional(),
  hidden: z.boolean().optional(),
  years: z.string().max(40).optional(),
});

export const sessionSchema = z.object({
  id: slug,
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  day: z.number().int().min(1).max(14),
  kind: z.enum(["talk", "workshop", "panel", "break"]),
  title: localizedRequired,
  description: localized,
  track: localizedRequired,
  room: localizedRequired,
  tags: z.array(localized).max(20),
  bring: localized.optional(),
  provided: localized.optional(),
  speakerIds: z.array(slug).max(20),
});

/**
 * `partner` is a TIER, not a second collection.
 *
 * PHASE19 asks for Partners alongside Sponsors, and the tempting reading is
 * another entity. But PAGES.md §1 describes one "sponsor/partner logo
 * marquee", the site renders exactly one strip, and a Partner would be a
 * byte-for-byte copy of this shape — same id, name, logo, link. That is two
 * schemas, two admin screens and two publish paths to keep in step, for a
 * distinction that only ever changes a label.
 *
 * So a partner is a sponsor whose tier says so. One collection, one form, and
 * grouping by tier already exists.
 */
/**
 * Ascending paid tiers matching the ticket tiers' naming (ADR: sponsor tier
 * rename), plus the two non-monetary options carried over from the original
 * scheme. See `SPONSOR_TIERS` in `data/types.ts` — same list, kept in sync
 * by hand since Zod's `z.enum` needs its own literal tuple.
 */
export const sponsorSchema = z.object({
  id: slug,
  name: z.string().trim().min(1).max(120),
  logoUrl: z.string().max(400),
  tier: z
    .enum([
      "haikyu",
      "sonnet",
      "opus",
      "fable",
      "mythos",
      "community",
      "partner",
    ])
    .optional(),
  websiteUrl: z.string().max(400).optional(),
  /** Short line for the cursor-reveal popup. Optional, both languages. */
  blurb: localized.optional(),
});

export const faqSchema = z.object({
  id: slug,
  category: z.enum(["general", "tickets", "venue", "shop", "code-of-conduct"]),
  question: localizedRequired,
  answer: localizedRequired,
  cta: z
    .object({
      label: localizedRequired,
      href: z.string().max(400),
      external: z.boolean().optional(),
    })
    .optional(),
});

export const productSchema = z.object({
  id: slug,
  name: localizedRequired,
  description: localizedRequired,
  priceXAF: z.number().int().min(0).max(10_000_000),
  images: z.array(z.string().max(400)).max(12),
  variants: z
    .object({
      size: z.array(z.enum(["XS", "S", "M", "L", "XL", "XXL"])).optional(),
      color: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
    })
    .optional(),
  stock: z
    .array(
      z.object({
        size: z.string().max(16).optional(),
        color: z.string().max(32).optional(),
        quantity: z.number().int().min(0).max(100_000),
      }),
    )
    .max(80)
    .optional(),
  status: z.enum(["pre-order", "in-stock", "venue-only", "sold-out"]),
  /**
   * Absent or true = live on the public shop. False = hidden/draft — an
   * admin still working on a listing, or one deliberately pulled from sale.
   * Same absent-means-visible convention as `hidden` on speakers/team.
   */
  published: z.boolean().optional(),
  /** Comes with a ticket, never sold alone — see `product-visibility.ts`. */
  ticketOnly: z.boolean().optional(),
});

/** One thing a ticket grants — "what your ticket includes" (admin-editable). */
export const entitlementSchema = z.object({
  label: localizedRequired,
  /** Phosphor icon name from the admin's fixed whitelist. Optional. */
  icon: z.string().max(40).optional(),
  note: localized.optional(),
});

export const ticketTierSchema = z.object({
  id: slug,
  name: z.string().trim().min(1).max(40),
  label: localized.optional(),
  priceXAF: z.number().int().min(0).max(10_000_000),
  rsvpExternal: z.boolean().optional(),
  /**
   * Shop products bundled with this tier, BY REFERENCE (ADR 0054).
   *
   * Ids only. A tier never creates or owns a product — it points at
   * listings the Shop already holds, so the same t-shirt bundled with three
   * tiers is one product, not three near-identical copies. Ids that no
   * longer resolve are ignored at render rather than validated away here:
   * a deleted product must not make an unrelated tier unsaveable.
   */
  swagProductIds: z.array(slug).max(20).optional(),
  description: localizedRequired,
  perks: z.array(entitlementSchema).max(30),
  includesApparel: z.boolean(),
  quantityAvailable: z.number().int().min(0).max(100_000).optional(),
  onSale: z.boolean(),
  /**
   * Explicit sold-out flag, independent of `quantityAvailable`. An admin can
   * pull a tier off sale for reasons the counter doesn't know about (e.g.
   * holding back seats). Checked server-side at checkout alongside capacity.
   */
  soldOut: z.boolean().optional(),
});

/**
 * A testimonial — "What people are saying" on the home page.
 *
 * `author` may be EMPTY on purpose. A quote whose speaker is not known by name
 * renders a localized generic attribution ("Community member") rather than
 * a name, and an invented name attributed to a real-looking person is worse
 * than no name. Same absent-means-visible `hidden` convention as speakers.
 */
export const quoteSchema = z.object({
  id: slug,
  text: localizedRequired,
  author: z.string().trim().max(120),
  role: localized.optional(),
  avatarUrl: z.string().max(400).optional(),
  hidden: z.boolean().optional(),
});

/**
 * A home page figure — "500+ developers".
 *
 * `value` is a whole, non-negative number because it is drawn by the digit
 * odometer, which has one column per digit and no decimal point or sign.
 * The cap keeps it to nine columns, which is already wider than the section.
 */
export const statSchema = z.object({
  id: slug,
  value: z.number().int().min(0).max(999_999_999),
  suffix: z.string().max(8).optional(),
  label: localizedRequired,
  /** Revealed under the cursor on desktop, shown inline on touch (ADR 0057). */
  imageUrl: z.string().max(400).optional(),
});

export const pastEditionSchema = z.object({
  id: slug,
  imageUrl: z.string().max(400),
  alt: localizedRequired,
  year: z.number().int().min(2000).max(2100).optional(),
});

const MAX_ROWS = 500;

function collection<T extends z.ZodType<{ id: string }>>(item: T) {
  return z.array(item).max(MAX_ROWS).refine(uniqueIds, "duplicate id");
}

export const COLLECTIONS = [
  "speakers",
  "team",
  "sessions",
  "sponsors",
  "faqs",
  "products",
  "ticket-tiers",
  "quotes",
  "stats",
  "past-editions",
] as const;

export type CollectionId = (typeof COLLECTIONS)[number];

export const collectionSchemas = {
  speakers: collection(speakerSchema),
  team: collection(teamSchema),
  sessions: collection(sessionSchema),
  sponsors: collection(sponsorSchema),
  faqs: collection(faqSchema),
  products: collection(productSchema),
  "ticket-tiers": collection(ticketTierSchema),
  quotes: collection(quoteSchema),
  stats: collection(statSchema),
  "past-editions": collection(pastEditionSchema),
} as const;

export function isCollectionId(value: string): value is CollectionId {
  return (COLLECTIONS as readonly string[]).includes(value);
}

const urlOrEmpty = z
  .string()
  .trim()
  .max(400)
  .refine(
    (value) =>
      value === "" ||
      value === "#" ||
      value.startsWith("/") ||
      value.startsWith("https://"),
    "expected a path, an https URL, or empty",
  );

/** An ISO instant, or empty/absent for "no deadline". */
const instantOrEmpty = z
  .string()
  .trim()
  .max(40)
  .refine(
    (value) => value === "" || !Number.isNaN(Date.parse(value)),
    "expected an ISO date-time, or empty",
  );

/**
 * Whether the call-for-speakers view is forced.
 *
 * `auto` is the answer nearly always: show the invitation while no speaker is
 * published, show the lineup once one is. The two overrides exist for the
 * edges `auto` cannot read — a lineup that is announced before it is entered,
 * or a call reopened after somebody was added.
 */
export const cfsOverrides = ["auto", "force-on", "force-off"] as const;

export const cfsSchema = z.object({
  url: urlOrEmpty.optional().nullable(),
  opensAt: instantOrEmpty.optional().nullable(),
  closesAt: instantOrEmpty.optional().nullable(),
  override: z.enum(cfsOverrides).optional(),
});

export const sponsorCallSchema = z.object({
  prospectusUrl: urlOrEmpty.optional().nullable(),
  enabled: z.boolean().optional(),
  closesAt: instantOrEmpty.optional().nullable(),
});

export const heroSchema = z.object({
  imageUrl: urlOrEmpty.optional().nullable(),
});

export const legalSchema = z.object({
  participationTermsUrl: urlOrEmpty.optional().nullable(),
  privacyUrl: urlOrEmpty.optional().nullable(),
  termsUrl: urlOrEmpty.optional().nullable(),
});

/**
 * Overall event capacity — a display/admin figure, independent of the
 * per-tier `quantityAvailable` caps that actually gate checkout. The two
 * can disagree (an admin is warned in the dashboard when the tier sum
 * exceeds this), but neither enforces the other server-side.
 */
export const capacitySchema = z.object({
  total: z.number().int().min(0).max(1_000_000).optional().nullable(),
});

export const memoryLaneSchema = z.object({
  /** Last edition's album — see `PAST_GALLERY_YEAR` for which year that is. */
  galleryUrl: urlOrEmpty.optional().nullable(),
  /**
   * THIS edition's album. Empty until an organiser uploads it — normally
   * after the event, since there is nothing to link before then. Once
   * `eventHasEnded()` is true, its presence (or absence) decides between a
   * primary "view the gallery" CTA and a "coming soon" placeholder, on both
   * the home page's Memory Lane section and in place of the hero's ticket
   * CTA (ADR 0058).
   */
  currentGalleryUrl: urlOrEmpty.optional().nullable(),
});

/** One boolean per navbar tab; `false` hides it. Strict, so a typo is refused. */
const navSchema = z
  .object({
    schedule: z.boolean(),
    speakers: z.boolean(),
    faqs: z.boolean(),
    team: z.boolean(),
    shop: z.boolean(),
    tickets: z.boolean(),
    /** DP generator + community wall footer links, together. */
    dpGenerator: z.boolean(),
  })
  .strict();

export const eventDateSchema = z.iso.date();

export const settingsSchema = z.object({
  eventDate: eventDateSchema.optional().nullable(),
  announcement: localized.optional().nullable(),
  bevyUrl: urlOrEmpty.optional().nullable(),
  hero: heroSchema.optional().nullable(),
  cfs: cfsSchema.optional().nullable(),
  sponsorCall: sponsorCallSchema.optional().nullable(),
  legal: legalSchema.optional().nullable(),
  capacity: capacitySchema.optional().nullable(),
  memoryLane: memoryLaneSchema.optional().nullable(),
  nav: navSchema.optional().nullable(),
});

function blankToNull(value: unknown): unknown {
  // Empty string from a date input, not a missing key — PATCH must not
  // treat an omitted `expiresAt` as "clear the expiry".
  if (value === "") return null;
  return value;
}

const discountWriteFields = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9-]+$/),
  kind: z.enum(["percent", "fixed"]),
  // The dashboard number input can arrive as a string; empty becomes 0
  // and fails min(1) with a readable issue instead of a generic 400.
  value: z.coerce.number().int().min(1).max(1_000_000),
  appliesTo: z.enum(["tickets", "shop", "both"]).default("both"),
  maxRedemptions: z.number().int().min(1).max(1_000_000).optional().nullable(),
  expiresAt: z.preprocess(
    blankToNull,
    z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), "invalid date")
      .nullable()
      .optional(),
  ),
  active: z.boolean().default(true),
});

export const discountWriteSchema = discountWriteFields.superRefine(
  (data, ctx) => {
    if (data.kind === "percent" && data.value > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "percent must be 1–100",
      });
    }
  },
);

export const discountPatchSchema = discountWriteFields.partial();

export function firstZodIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "invalid payload";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export type DiscountWrite = z.infer<typeof discountWriteSchema>;
export type SettingsWrite = z.infer<typeof settingsSchema>;
