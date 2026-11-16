import "server-only";
import type { DpShape } from "./shapes";

/**
 * The photo shapes paid pass holders and admins can pick (ADR 0080).
 *
 * Server-only, like the collector frames (ADR 0077): the shape engine is in
 * the public bundle, these recipes are not — `GET /api/dp/collector-frames`
 * sends them to entitled users only. Tuned so a face still has room: every
 * shape keeps most of the photo's middle.
 */
export function collectorShapes(): DpShape[] {
  return [
    {
      id: "shape-sparkle",
      label: { fr: "Étincelle", en: "Sparkle" },
      // Fuller than the logo, so a face fits in the middle — but still
      // concave enough to read as a sparkle, not a diamond.
      recipe: { kind: "sparkle", fullness: 0.3 },
    },
    {
      id: "shape-cookie",
      label: { fr: "Biscuit", en: "Cookie" },
      recipe: { kind: "polar", lobes: 9, depth: 0.075, sharpness: 0.9 },
    },
    {
      id: "shape-clover",
      label: { fr: "Trèfle", en: "Clover" },
      recipe: {
        kind: "polar",
        lobes: 4,
        depth: 0.22,
        sharpness: 0.55,
        rotation: 45,
      },
    },
    {
      id: "shape-burst",
      label: { fr: "Éclat", en: "Burst" },
      recipe: { kind: "polar", lobes: 12, depth: 0.1, sharpness: 1.6 },
    },
    {
      id: "shape-pentagon",
      label: { fr: "Pentagone", en: "Pentagon" },
      recipe: { kind: "polygon", sides: 5, roundness: 0.32 },
    },
  ];
}
