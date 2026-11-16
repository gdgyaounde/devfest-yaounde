/**
 * DP generator — expressive shapes (ADR 0080).
 *
 * One small engine for the soft, playful geometry Google uses in the Gemini
 * sparkle and in its wallpapers: a four-point sparkle with concave sides,
 * scalloped "cookies", lobed clovers, soft bursts and rounded polygons.
 *
 * Used two ways:
 *   - as PHOTO MASKS (the shape picker), from recipes that only paid pass
 *     holders and admins receive (`collector-shapes.ts`, server-only);
 *   - as the big decorative pieces in the collector frames' patterns.
 *
 * Every shape is described by a small RECIPE (data), and drawn into a box.
 * Everything is flat: these produce outlines to fill or clip, never ramps.
 */

export type ShapeRecipe =
  | {
      kind: "sparkle";
      /**
       * 0 = the sides pass through the centre (a needle-thin star);
       * ~0.35 = the full Gemini sparkle; higher = rounder, more photo shown.
       */
      fullness: number;
      rotation?: number;
    }
  | {
      kind: "polar";
      /** Number of lobes / scallops / points. */
      lobes: number;
      /** How deep the valleys between lobes go, 0–1 of the radius. */
      depth: number;
      /**
       * Lobe profile: < 1 fat rounded lobes (cookie, clover), 1 a sine
       * wave, > 1 pointier (burst).
       */
      sharpness: number;
      rotation?: number;
    }
  | {
      kind: "polygon";
      sides: number;
      /** Corner rounding, as a fraction of the shape's radius. */
      roundness: number;
      rotation?: number;
    };

/** A photo shape offered in the picker: a recipe plus its name. */
export interface DpShape {
  id: string;
  label: { fr: string; en: string };
  recipe: ShapeRecipe;
}

/** The ids are public (the wall recognises them); the recipes are not. */
export const COLLECTOR_SHAPE_IDS = [
  "shape-sparkle",
  "shape-cookie",
  "shape-clover",
  "shape-burst",
  "shape-pentagon",
] as const;

export function isCollectorShapeId(id: string): boolean {
  return (COLLECTOR_SHAPE_IDS as readonly string[]).includes(id);
}

/** Degrees to radians. */
const rad = (deg = 0) => (deg * Math.PI) / 180;

/**
 * The radius of a polar recipe at angle `theta`, as a fraction of the
 * outer radius (1 = a lobe tip). Exported for the tests.
 */
export function polarRadius(
  recipe: Extract<ShapeRecipe, { kind: "polar" }>,
  theta: number,
): number {
  const wave =
    (1 + Math.cos(recipe.lobes * (theta - rad(recipe.rotation)))) / 2;
  return 1 - recipe.depth + recipe.depth * Math.pow(wave, recipe.sharpness);
}

/** Where a shape sits inside a box: centred, never wider than the box. */
export interface ShapeBox {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * The shape's ellipse inside a photo box.
 *
 * Square-ish boxes get a round shape. A portrait box (the 3:4 card) gets one
 * stretched a little, never more than 18 %, centred — a sparkle pulled to
 * 140 % stops reading as a sparkle.
 */
export function fitShape(x: number, y: number, w: number, h: number): ShapeBox {
  const rx = w / 2;
  const ry = Math.min(h, w * 1.18) / 2;
  return { cx: x + w / 2, cy: y + h / 2, rx, ry };
}

/**
 * Trace a recipe into `path` (a canvas context or a Path2D). The caller
 * fills, clips or strokes it.
 */
export function traceShape(
  path: CanvasRenderingContext2D | Path2D,
  recipe: ShapeRecipe,
  box: ShapeBox,
) {
  const { cx, cy, rx, ry } = box;
  const at = (angle: number, r: number): [number, number] => [
    cx + Math.cos(angle) * r * rx,
    cy + Math.sin(angle) * r * ry,
  ];

  if (recipe.kind === "sparkle") {
    // Four tips on the axes; each side is a curve bowed IN toward the
    // centre, the control point pulled from the centre toward the box's
    // corner by `fullness`.
    const base = rad(recipe.rotation) - Math.PI / 2;
    const tips = [0, 1, 2, 3].map((i) => at(base + (i * Math.PI) / 2, 1));
    const ctrl = [0, 1, 2, 3].map((i) =>
      at(base + (i * Math.PI) / 2 + Math.PI / 4, recipe.fullness * Math.SQRT2),
    );
    path.moveTo(tips[0][0], tips[0][1]);
    for (let i = 0; i < 4; i++) {
      const next = tips[(i + 1) % 4];
      path.quadraticCurveTo(ctrl[i][0], ctrl[i][1], next[0], next[1]);
    }
    path.closePath();
    return;
  }

  if (recipe.kind === "polar") {
    const steps = 360;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      const [x, y] = at(theta, polarRadius(recipe, theta));
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    return;
  }

  // Rounded polygon: arcTo at every corner, starting mid-edge so the first
  // corner is rounded like the rest.
  const n = recipe.sides;
  const base = rad(recipe.rotation) - Math.PI / 2;
  const corners = Array.from({ length: n }, (_, i) =>
    at(base + (i * 2 * Math.PI) / n, 1),
  );
  const radius = recipe.roundness * Math.min(rx, ry);
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const start = mid(corners[n - 1], corners[0]);
  path.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const corner = corners[i];
    const next = corners[(i + 1) % n];
    path.arcTo(corner[0], corner[1], next[0], next[1], radius);
  }
  path.closePath();
}

/** Convenience: a fresh path for a recipe in a box. */
export function shapePath(recipe: ShapeRecipe, box: ShapeBox): Path2D {
  const path = new Path2D();
  traceShape(path, recipe, box);
  return path;
}
