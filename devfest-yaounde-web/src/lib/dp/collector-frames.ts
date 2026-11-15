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
 * Their pattern routines (`foil`, `stub` in `patterns.ts`) do ship — they
 * are harmless without a definition to select them.
 *
 * Flat colours from DESIGN.md §2, yellow family only; no gradients.
 */
const INK = "#1E1E1E";
const PAPER = "#F0F0F0";
const YELLOW = "#F9AB00";
const YELLOW_LIGHT = "#FFD427";
const YELLOW_PASTEL = "#FFE7A5";

export function collectorFrames(tierName: string): DpFrame[] {
  return [
    {
      id: "collector-foil",
      label: { fr: "Feuille d'or", en: "Gold foil" },
      background: INK,
      accent: YELLOW,
      foreground: INK,
      plate: YELLOW_LIGHT,
      pattern: "foil",
      palette: [YELLOW, YELLOW_LIGHT],
      duotone: [INK, YELLOW_LIGHT],
      collector: { tierName },
    },
    {
      id: "collector-stub",
      label: { fr: "Talon de billet", en: "Ticket stub" },
      background: YELLOW_LIGHT,
      accent: YELLOW,
      foreground: INK,
      plate: PAPER,
      pattern: "stub",
      palette: [YELLOW, YELLOW_PASTEL],
      duotone: [INK, YELLOW_PASTEL],
      collector: { tierName },
    },
  ];
}
