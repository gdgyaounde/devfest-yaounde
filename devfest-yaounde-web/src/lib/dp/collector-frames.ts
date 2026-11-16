import "server-only";
import type { DpFrame } from "./frames";

/**
 * The COLLECTOR frame definitions (ADR 0077) — server-only, on purpose.
 *
 * Every public frame lives in `frames.ts`, which ships to the browser, so
 * anything defined there can be switched on from devtools. These are only
 * ever sent by `GET /api/dp/collector-frames`, after the entitlement check,
 * and `import "server-only"` makes a client import a build error.
 *
 * Their pattern routines (`guilloche`, `constellation`, `shapes` in
 * `patterns.ts`) do ship — they are harmless without a definition to select
 * them. Redesigned in ADR 0080: premium, and nothing personal printed.
 *
 * Flat colours from DESIGN.md §2, yellow family only; no gradients.
 */
const INK = "#1E1E1E";
const PAPER = "#F0F0F0";
const YELLOW = "#F9AB00";
const YELLOW_LIGHT = "#FFD427";
const YELLOW_PASTEL = "#FFE7A5";

export function collectorFrames(): DpFrame[] {
  return [
    {
      id: "collector-midnight",
      label: { fr: "Minuit doré", en: "Midnight gold" },
      background: INK,
      accent: YELLOW,
      // A black plate with gold type: the premium one.
      foreground: YELLOW_LIGHT,
      plate: INK,
      pattern: "guilloche",
      palette: [YELLOW, YELLOW_LIGHT],
      duotone: [INK, YELLOW_LIGHT],
      collector: true,
    },
    {
      id: "collector-constellation",
      label: { fr: "Constellation", en: "Constellation" },
      background: YELLOW_PASTEL,
      accent: YELLOW,
      foreground: INK,
      plate: PAPER,
      pattern: "constellation",
      palette: [YELLOW, YELLOW_LIGHT],
      duotone: [INK, YELLOW_PASTEL],
      collector: true,
    },
    {
      id: "collector-shapes",
      label: { fr: "Formes", en: "Shapes" },
      background: YELLOW,
      accent: INK,
      foreground: INK,
      plate: PAPER,
      pattern: "shapes",
      palette: [YELLOW_LIGHT, YELLOW_PASTEL, PAPER],
      duotone: [INK, YELLOW_LIGHT],
      collector: true,
    },
  ];
}
