import { z } from "zod";

/**
 * Anonymous testimonials (ADR 0087): the pure rules, unit-tested.
 *
 * Length: the home page's own testimonials run 80–175 characters, which is
 * what reads well at display size. 280 leaves room for "something
 * interesting" while keeping every one of them a single breath on the wall.
 */
export const MESSAGE_MIN = 20;
export const MESSAGE_MAX = 280;
export const OTHER_MAX = 40;

/** Preset roles; anything else is "other" and typed by hand. */
export const TESTIMONIAL_ROLES = [
  "attendee",
  "speaker",
  "volunteer",
  "organiser",
  "sponsor",
  "partner",
] as const;
export type TestimonialRole = (typeof TESTIMONIAL_ROLES)[number];

/** Every edition year, newest first. */
export const TESTIMONIAL_EDITIONS = Array.from({ length: 11 }, (_, i) =>
  String(2026 - i),
);

const choice = (presets: readonly string[]) =>
  z
    .union([
      z.object({ kind: z.literal("preset"), value: z.string() }).strict(),
      z
        .object({
          kind: z.literal("other"),
          value: z.string().trim().min(1).max(OTHER_MAX),
        })
        .strict(),
    ])
    .refine((c) => c.kind === "other" || presets.includes(c.value))
    .nullable()
    .optional();

export const testimonialSchema = z
  .object({
    message: z.string(),
    role: choice(TESTIMONIAL_ROLES),
    edition: choice(TESTIMONIAL_EDITIONS),
    locale: z.enum(["fr", "en"]),
    /** Honeypot: a real person never sees or fills it. */
    website: z.string().max(200).optional(),
  })
  .strict();

export type TestimonialInput = z.infer<typeof testimonialSchema>;

/** Collapse runs of blank lines and spaces; keep single line breaks. */
export function cleanMessage(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export type TestimonialCheck =
  | { ok: true; message: string; role: string | null; edition: string | null }
  | { ok: false; error: "too_short" | "too_long" | "spam" };

/** What is stored: a clean message, and role/edition as plain text or null. */
export function checkTestimonial(input: TestimonialInput): TestimonialCheck {
  if (input.website && input.website.trim() !== "") {
    return { ok: false, error: "spam" };
  }
  const message = cleanMessage(input.message);
  if (message.length < MESSAGE_MIN) return { ok: false, error: "too_short" };
  if (message.length > MESSAGE_MAX) return { ok: false, error: "too_long" };
  const flat = (c: TestimonialInput["role"]) =>
    c ? cleanMessage(c.value).replace(/\n/g, " ") || null : null;
  return {
    ok: true,
    message,
    role: flat(input.role),
    edition: flat(input.edition),
  };
}

export interface PublicTestimonial {
  id: string;
  message: string;
  role: string | null;
  edition: string | null;
  locale: "fr" | "en";
}

/**
 * The story order for the wall: oldest edition first, so the reel walks
 * through the years; undated ones close it; within an edition, oldest first.
 */
export function storyOrder<
  T extends { edition: string | null; createdAt: string },
>(rows: readonly T[]): T[] {
  const year = (e: string | null) => {
    const m = e?.match(/\b(19|20)\d{2}\b/);
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  };
  return [...rows].sort(
    (a, b) =>
      year(a.edition) - year(b.edition) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
