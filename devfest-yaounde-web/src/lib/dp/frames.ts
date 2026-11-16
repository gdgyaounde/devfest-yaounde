/**
 * DP generator — the style catalog.
 *
 * A style is DATA: colours, a background pattern, and the plate the branding
 * sits on. Adding one for next year's edition is an entry in `DP_FRAMES` and
 * nothing else — the picker, the swatches and the compositor all read it.
 *
 * Colours come from DESIGN.md §2 (the four Google families, their halftones
 * and pastels). Every fill is FLAT (§2.6): the craft comes from shape and
 * repetition, never from a colour ramp.
 */

/**
 * The background patterns. Each is a drawing routine in `compose.ts` that
 * reads its colours from the style, so any style can use any of them.
 *
 * `confetti`  — flat shapes and chevrons scattered across the ground
 * `terrazzo`  — chips of the four brand families, speckled like terrazzo
 * `halftone`  — a dot field that thins across the card (§2.4)
 * `checker`   — a bold offset checkerboard of rounded squares
 * `waves`     — repeated brush arcs, like a printed pattern
 * `grid`      — a drafting grid with heavier rules and corner ticks
 * `rays`      — flat wedges radiating from a corner, no colour ramp
 * `tiles`     — two-tone rounded tiling, quietly dense
 * `guilloche` — COLLECTOR: engraved gold rosettes on black, banknote-style
 * `constellation` — COLLECTOR: Gemini-style sparkles, wallpaper-scale
 * `shapes`    — COLLECTOR: big soft Material shapes, overlapping and cropped
 */
export type DpPattern =
  | "confetti"
  | "terrazzo"
  | "halftone"
  | "checker"
  | "waves"
  | "grid"
  | "rays"
  | "tiles"
  | "guilloche"
  | "constellation"
  | "shapes";

export interface DpFrame {
  id: string;
  /** Shown in the picker. Both languages, per the i18n rule. */
  label: { fr: string; en: string };
  /** The card's ground. */
  background: string;
  /** The pattern drawn over it, and the plate's fill. */
  accent: string;
  /** Type colour on the plate. */
  foreground: string;
  /** The plate the branding sits on. */
  plate: string;
  pattern: DpPattern;
  /** Pattern colours. Defaults to the accent alone. */
  palette?: string[];
  /** [shadow, highlight] for the duotone and halftone photo effects. */
  duotone?: [string, string];
  /**
   * True on the COLLECTOR frames only (ADR 0077, 0080) — and those frames
   * are never in this file: their definitions are served by
   * `GET /api/dp/collector-frames` to paid pass holders and admins. It adds
   * the collector seal. Nothing personal (no tier, no serial) is printed.
   */
  collector?: boolean;
}

/**
 * The collector frames' ids — public on purpose (the wall needs to recognise
 * and refuse them), unlike their definitions. See ADR 0077.
 */
export const COLLECTOR_FRAME_IDS = [
  "collector-midnight",
  "collector-constellation",
  "collector-shapes",
] as const;

export function isCollectorFrameId(id: string): boolean {
  return (COLLECTOR_FRAME_IDS as readonly string[]).includes(id);
}

const INK = "#1E1E1E";
const PAPER = "#F0F0F0";
const YELLOW = "#F9AB00";
const YELLOW_LIGHT = "#FFD427";
const YELLOW_PASTEL = "#FFE7A5";
const BLUE = "#4285F4";
const BLUE_LIGHT = "#57CAFF";
const BLUE_PASTEL = "#C3ECF6";
const GREEN = "#34A853";
const GREEN_LIGHT = "#5CDB6D";
const GREEN_PASTEL = "#CCF6C5";
const RED = "#EA4335";
const RED_LIGHT = "#FF7DAF";
const RED_PASTEL = "#F8D8D8";

/** The four families together — the DevFest mark's own palette. */
const BRAND_FOUR = [YELLOW, BLUE, GREEN, RED];

export const DP_FRAMES: DpFrame[] = [
  {
    id: "confetti",
    label: { fr: "Confettis", en: "Confetti" },
    background: YELLOW_PASTEL,
    accent: YELLOW,
    foreground: INK,
    plate: YELLOW,
    pattern: "confetti",
    palette: BRAND_FOUR,
    duotone: [INK, YELLOW_LIGHT],
  },
  {
    id: "terrazzo",
    label: { fr: "Terrazzo", en: "Terrazzo" },
    background: PAPER,
    accent: INK,
    foreground: INK,
    plate: YELLOW_PASTEL,
    pattern: "terrazzo",
    palette: BRAND_FOUR,
    duotone: [INK, YELLOW],
  },
  {
    id: "midnight",
    label: { fr: "Minuit", en: "Midnight" },
    background: INK,
    accent: YELLOW_LIGHT,
    foreground: INK,
    plate: YELLOW_LIGHT,
    pattern: "halftone",
    palette: [YELLOW_LIGHT, YELLOW],
    duotone: [INK, YELLOW_LIGHT],
  },
  {
    id: "checker",
    label: { fr: "Damier", en: "Checker" },
    background: YELLOW,
    accent: INK,
    foreground: INK,
    plate: PAPER,
    pattern: "checker",
    palette: [YELLOW_LIGHT],
    duotone: [INK, YELLOW_PASTEL],
  },
  {
    id: "lagoon",
    label: { fr: "Lagune", en: "Lagoon" },
    background: BLUE_PASTEL,
    accent: BLUE,
    foreground: INK,
    plate: BLUE,
    pattern: "waves",
    palette: [BLUE, BLUE_LIGHT],
    duotone: [INK, BLUE_LIGHT],
  },
  {
    id: "blueprint",
    label: { fr: "Plan", en: "Blueprint" },
    background: "#0B2545",
    accent: BLUE_LIGHT,
    foreground: PAPER,
    plate: "#0B2545",
    pattern: "grid",
    palette: [BLUE_LIGHT, BLUE],
    duotone: ["#0B2545", BLUE_LIGHT],
  },
  {
    id: "grove",
    label: { fr: "Bosquet", en: "Grove" },
    background: GREEN_PASTEL,
    accent: GREEN,
    foreground: INK,
    plate: GREEN_LIGHT,
    pattern: "tiles",
    palette: [GREEN, GREEN_LIGHT],
    duotone: [INK, GREEN_LIGHT],
  },
  {
    id: "hibiscus",
    label: { fr: "Hibiscus", en: "Hibiscus" },
    background: RED_PASTEL,
    accent: RED,
    foreground: INK,
    plate: RED_LIGHT,
    pattern: "rays",
    palette: [RED, RED_LIGHT],
    duotone: [INK, RED_LIGHT],
  },
];

export function findFrame(id: string): DpFrame | undefined {
  return DP_FRAMES.find((frame) => frame.id === id);
}

export const DEFAULT_FRAME_ID = DP_FRAMES[0].id;

/**
 * The badge that hangs off the branding plate.
 *
 * ATTENDANCE ONLY, AND THAT IS A DECISION (PHASE16 §4). "Speaker",
 * "Organiser" and "Volunteer" are claims about a role, and with no login and
 * no backend there is nothing to check them against — a self-selectable
 * Speaker badge means anyone can wear one, which devalues it for the people
 * who actually earned it. Everything here is a statement about yourself that
 * costs nobody anything if it is wrong.
 *
 * Role badges are recorded as a backend item (GAPS.md G19). If a soft
 * unlock code is ever wanted, this array and one input are where it lands.
 */
export interface DpBadge {
  id: string;
  label: { fr: string; en: string };
  /** Empty for `none`; what actually gets printed otherwise. */
  text: { fr: string; en: string };
}

export const DP_BADGES: DpBadge[] = [
  { id: "none", label: { fr: "Aucun", en: "None" }, text: { fr: "", en: "" } },
  {
    id: "attending",
    label: { fr: "J'y serai", en: "I'll be there" },
    text: { fr: "J'Y SERAI", en: "I'LL BE THERE" },
  },
  {
    id: "countmein",
    label: { fr: "J'en suis", en: "Count me in" },
    text: { fr: "J'EN SUIS", en: "COUNT ME IN" },
  },
  {
    id: "firsttime",
    label: { fr: "Première fois", en: "First timer" },
    text: { fr: "MA PREMIÈRE FOIS", en: "MY FIRST ONE" },
  },
  {
    id: "backagain",
    label: { fr: "J'y retourne", en: "Back again" },
    text: { fr: "J'Y RETOURNE", en: "BACK AGAIN" },
  },
];

export const DEFAULT_BADGE_ID = DP_BADGES[0].id;

/**
 * The typed badge (ADR 0080) — paid passes and admins only. Not in
 * `DP_BADGES`: it has no preset text, the person writes it.
 */
export const CUSTOM_BADGE_ID = "custom";

export function findBadge(id: string): DpBadge | undefined {
  return DP_BADGES.find((badge) => badge.id === id);
}
