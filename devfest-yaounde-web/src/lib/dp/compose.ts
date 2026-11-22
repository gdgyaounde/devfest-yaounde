/**
 * DP generator — canvas compositing.
 *
 * Runs entirely in the browser. The photo is read with `createImageBitmap`
 * from a local File and drawn to a canvas; it is never uploaded, so there is
 * no server copy, no EXIF to strip and no retention question to answer.
 * See docs/decisions/0015-dp-generator-client-side.md.
 *
 * ONE RENDERER, TWO SIZES. The preview and the export run this exact
 * function; only the pixel dimensions differ. That is what lets a test read
 * the downloaded file back and compare it to the preview the person
 * approved — and it is the reason the effects stay on 2D canvas rather than
 * moving to WebGL. A GL path fast enough to matter would still need a 2D
 * fallback for the export and for machines without a context, and two
 * renderers is exactly how a file stops matching its preview. Every effect
 * here is one pass over an ImageData buffer or a few hundred paths, on a
 * region under 1000px square.
 *
 * Layout, radii and the photo box come from `geometry.ts`; the background
 * patterns from `patterns.ts`; the stickers from `stickers.ts`. This file
 * owns the photo treatments and the order things are drawn in.
 */
import {
  MARK_PATHS,
  MARK_STROKE_WIDTH,
  MARK_VIEWBOX,
} from "@/lib/brand/devfest-mark";
import { EVENT } from "@/lib/event";
import {
  DEFAULT_BADGE_ID,
  DEFAULT_FRAME_ID,
  findBadge,
  findFrame,
  type DpFrame,
} from "./frames";
import {
  SHAPE_GROW,
  cardHeight,
  layoutCard,
  type CardLayout,
  type DpCorners,
  type DpRatio,
  type Rect,
} from "./geometry";
import {
  drawOverspill,
  drawPattern,
  roundedRectPath,
  seeded,
} from "./patterns";
import { fitShape, shapePath, type ShapeRecipe } from "./shapes";
import {
  findSticker,
  STICKER_BASE,
  type PlacedSticker,
  type ShapeSticker,
} from "./stickers";

export type { DpRatio, DpCorners } from "./geometry";
export { photoBoxUnits, cardHeight, layoutCard, SHAPE_GROW } from "./geometry";

/** Card WIDTH for the export. Height follows from the ratio. */
export const DP_SIZE = 1080;
/** The "print it big" option — same art, four times the pixels. */
export const DP_SIZE_HIGH = 2160;

/** Reject files that are not really images, or are large enough to hurt. */
export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

export interface DpTransform {
  /** 1 = photo covers the box. Higher zooms in. */
  scale: number;
  /** Pan, as fractions of the photo box's own width and height. */
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_TRANSFORM: DpTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

/** The photo treatment. One at a time — these are alternatives, not layers. */
export type DpLook =
  | "none"
  | "duotone"
  | "halftone"
  | "mono"
  | "chromatic"
  | "poster"
  | "pixel"
  | "mosaic";

/** How the photo's edge meets the card. */
export type DpEdge = "clean" | "torn" | "brush";

export interface DpEffects {
  look: DpLook;
  edge: DpEdge;
  /** Film grain. */
  grain: boolean;
  /** Darkened corners, computed per pixel. */
  vignette: boolean;
  /** Paper fibre and a faint press texture. */
  paper: boolean;
  /** A gentle horizontal ripple, like a misfed print. */
  warp: boolean;
  /** Fisheye: the whole photo bulges, as though seen through a peephole. */
  lens: boolean;
}

export const DEFAULT_EFFECTS: DpEffects = {
  look: "none",
  edge: "clean",
  grain: false,
  vignette: false,
  paper: false,
  warp: false,
  lens: false,
};

export interface DpComposeInput {
  photo: ImageBitmap;
  frameId?: string;
  /**
   * A resolved style, used instead of looking `frameId` up in the public
   * catalog — how the COLLECTOR frames (ADR 0077) are drawn: their
   * definitions come from the entitlement API, never from `frames.ts`.
   */
  frame?: DpFrame;
  /** Free-form display name — no real-name requirement (PAGES.md §9). */
  nickname: string;
  transform?: DpTransform;
  /** Card width. Height follows from `ratio`. */
  size?: number;
  ratio?: DpRatio;
  corners?: DpCorners;
  effects?: DpEffects;
  badgeId?: string;
  /**
   * The badge's text, typed by the person — paid passes and admins only
   * (ADR 0080). When set it replaces the preset badge's text.
   */
  badgeText?: string;
  /**
   * A photo shape from the collector shape picker (ADR 0080). When set the
   * photo is cut to it instead of the rounded rectangle, and the edge
   * treatment (torn, brush) does not apply.
   */
  shape?: ShapeRecipe | null;
  stickers?: PlacedSticker[];
  locale?: "fr" | "en";
}

export class DpImageError extends Error {
  constructor(readonly code: "unsupported_type" | "too_large" | "unreadable") {
    super(code);
    this.name = "DpImageError";
  }
}

/**
 * Turns a picked File into a bitmap, validating first.
 *
 * The validation is a UX guard, not a security control — nothing leaves the
 * device, so a malformed file can only spoil the user's own render.
 */
export async function loadPhoto(file: File): Promise<ImageBitmap> {
  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    throw new DpImageError("unsupported_type");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new DpImageError("too_large");
  }
  try {
    return await createImageBitmap(file);
  } catch {
    throw new DpImageError("unreadable");
  }
}

/* ------------------------------------------------------------- canvas util */

function makeCanvas(
  w: number,
  h: number,
): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D;
} {
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), {
          width: w,
          height: h,
        });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("2d canvas context unavailable");
  return { canvas, ctx };
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const n = parseInt(
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rec. 709 luma — the weighting that matches how bright a colour looks. */
const luma = (r: number, g: number, b: number) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Shrinks the type until it fits, rather than squashing it to width. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  build: (px: number) => string,
  startPx: number,
  minPx: number,
): number {
  let px = startPx;
  while (px > minPx) {
    ctx.font = build(px);
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= Math.max(1, startPx * 0.02);
  }
  ctx.font = build(px);
  return px;
}

/* ------------------------------------------------------------- photo layer */

/**
 * Draws the photo to COVER the box — the short edge fills, the long edge
 * overflows and is clipped. Scale and pan ride on top of that baseline, so
 * "scale 1, no offset" always produces a sensibly framed portrait.
 */
function drawCovered(
  ctx: CanvasRenderingContext2D,
  photo: ImageBitmap,
  w: number,
  h: number,
  transform: DpTransform,
) {
  const cover = Math.max(w / photo.width, h / photo.height);
  const scale = cover * Math.max(transform.scale, 0.1);
  const drawW = photo.width * scale;
  const drawH = photo.height * scale;
  const cx = w / 2 + transform.offsetX * w;
  const cy = h / 2 + transform.offsetY * h;
  ctx.drawImage(photo, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
}

/** Turns the photo into halftone dots, in the style's own two colours. */
function halftonePhoto(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dark: string,
  light: string,
) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const cell = Math.max(4, Math.round(Math.min(w, h) / 58));
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = dark;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const sx = Math.min(w - 1, x + (cell >> 1));
      const sy = Math.min(h - 1, y + (cell >> 1));
      const i = (sy * w + sx) * 4;
      const t = luma(data[i], data[i + 1], data[i + 2]) / 255;
      const r = (cell / 2) * Math.sqrt(1 - t) * 1.22;
      if (r < 0.35) continue;
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Mosaic: the photo laid out as tiles.
 *
 * Not `pixelate` with bigger blocks. Pixel art floods square blocks flush
 * against each other, so it reads as a low-resolution picture; a mosaic
 * reads as a picture MADE of pieces — each tile takes the average colour of
 * the ground under it, is inset from its neighbours so a dark seam of grout
 * shows between them, and is nudged a little lighter or darker (seeded, so a
 * given photo always lays the same way) the way hand-set tesserae never
 * quite match.
 *
 * EVERYTHING is a fraction of the render. The grid is a fixed number of
 * columns, the grout a fixed share of a tile, and the tonal nudge is drawn
 * in a fixed order from a seeded generator — so the 2160px file is the same
 * picture as the preview, just crisper, rather than a different arrangement
 * that happened to be exported.
 *
 * The tile boundaries come from rounding `i * w / cols`, not from repeating
 * a fixed pixel width, so the grid tiles the box EXACTLY: no sliver of a
 * partial tile down the right or bottom edge, and no seam of a different
 * width from its neighbours.
 */
const MOSAIC_COLUMNS = 34;
/** The tile's inset on each side, as a share of the tile's own size. */
const MOSAIC_GROUT = 0.055;
/** ± this much brightness (0-255 scale) per tile. */
const MOSAIC_JITTER = 9;

export function mosaicPhoto(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const cols = Math.max(4, Math.min(MOSAIC_COLUMNS, Math.floor(w / 4)));
  const rows = Math.max(4, Math.round((h * cols) / w));
  const rand = seeded(`${seed}-mosaic`);
  const inset = Math.max(0.5, (w / cols) * MOSAIC_GROUT);

  // The grout: the site's ink, under everything.
  ctx.fillStyle = "#1E1E1E";
  ctx.fillRect(0, 0, w, h);

  for (let row = 0; row < rows; row++) {
    const y0 = Math.round((row * h) / rows);
    const y1 = Math.round(((row + 1) * h) / rows);
    for (let col = 0; col < cols; col++) {
      const x0 = Math.round((col * w) / cols);
      const x1 = Math.round(((col + 1) * w) / cols);

      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
      }
      // Drawn BEFORE the degenerate-tile check, so the sequence of random
      // draws — and therefore every other tile — never shifts.
      const nudge = (rand() - 0.5) * 2 * MOSAIC_JITTER;
      if (!n) continue;
      const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
      ctx.fillStyle = `rgb(${clamp(r / n + nudge)},${clamp(g / n + nudge)},${clamp(b / n + nudge)})`;
      ctx.fillRect(
        x0 + inset,
        y0 + inset,
        Math.max(0, x1 - x0 - inset * 2),
        Math.max(0, y1 - y0 - inset * 2),
      );
    }
  }
}

/**
 * The geometric pass: warp and chromatic offset both READ from a copy of the
 * buffer, so they run together in one remap rather than one after the other.
 */
function geometricPass(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  effects: DpEffects,
) {
  if (!effects.warp && !effects.lens && effects.look !== "chromatic") return;

  const image = ctx.getImageData(0, 0, w, h);
  const dst = image.data;
  const src = new Uint8ClampedArray(dst);
  const amp = effects.warp ? Math.max(2, w * 0.012) : 0;
  const wl = h / 5.5;
  /* ROUNDED, and that is not cosmetic. A fractional shift makes a fractional
     ARRAY INDEX, `src[i + 4.1]` is `undefined`, and assigning undefined into
     a Uint8ClampedArray writes 0 — so red and blue were being zeroed and the
     "misprint" look came out as a solid green photograph. */
  const shift =
    effects.look === "chromatic" ? Math.round(Math.max(1, w * 0.006)) : 0;

  const sample = (x: number, y: number, channel: number) => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    return src[(cy * w + cx) * 4 + channel];
  };

  /*
   * FISHEYE — the whole photo bulging, as through a door peephole.
   *
   * For each output pixel, sample from a point pulled TOWARD the centre by
   * `r^BULGE`. Since the radius is normalised against the half-diagonal, r is
   * never above 1, so `r^BULGE` is never above r and every sample lands
   * inside the photo — no stretched corners, no empty edges to paper over.
   *
   * Pulling inward magnifies the middle and compresses the rim, which is
   * exactly what a wide lens does. An earlier version drew a magnifying glass
   * ON the card instead; this distorts the picture rather than illustrating
   * the idea of one.
   */
  const BULGE = 1.55;
  const cx0 = (w - 1) / 2;
  const cy0 = (h - 1) / 2;
  const halfDiag = Math.hypot(cx0, cy0) || 1;

  for (let y = 0; y < h; y++) {
    const dx = amp ? Math.round(Math.sin((y / wl) * Math.PI * 2) * amp) : 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let bx = x;
      let by = y;

      if (effects.lens) {
        const vx = x - cx0;
        const vy = y - cy0;
        const r = Math.hypot(vx, vy) / halfDiag;
        if (r > 0) {
          const k = Math.pow(r, BULGE) / r;
          bx = Math.round(cx0 + vx * k);
          by = Math.round(cy0 + vy * k);
        }
      }

      const sx = bx + dx;
      // Channels pulled from three slightly different places is what
      // misregistered print looks like.
      dst[i] = sample(sx - shift, by, 0);
      dst[i + 1] = sample(sx, by, 1);
      dst[i + 2] = sample(sx + shift, by, 2);
      dst[i + 3] = sample(sx, by, 3);
    }
  }

  ctx.putImageData(image, 0, 0);
}

/**
 * Pixel art: average each block and flood it back.
 *
 * The block is a FRACTION of the render, not a fixed number of pixels, so the
 * preview and the 2160 export show the same picture — a fixed 8px block would
 * be chunky on screen and invisible in the file.
 */
function pixelate(image: ImageData, w: number, h: number) {
  const px = image.data;
  const block = Math.max(3, Math.round(w / 40));
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const maxX = Math.min(bx + block, w);
      const maxY = Math.min(by + block, h);
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const i = (y * w + x) * 4;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
          n++;
        }
      }
      if (!n) continue;
      r = Math.round(r / n);
      g = Math.round(g / n);
      b = Math.round(b / n);
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const i = (y * w + x) * 4;
          px[i] = r;
          px[i + 1] = g;
          px[i + 2] = b;
        }
      }
    }
  }
}

/**
 * The colour pass: look, grain, paper and vignette in ONE walk of the buffer.
 * Four separate passes would read the same pixels four times for no gain.
 */
function colourPass(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  effects: DpEffects,
  frame: DpFrame,
) {
  const wantsColour =
    effects.look === "duotone" ||
    effects.look === "mono" ||
    effects.look === "poster";
  if (
    !wantsColour &&
    !effects.grain &&
    !effects.vignette &&
    !effects.paper &&
    effects.look !== "pixel"
  ) {
    return;
  }

  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const [dr, dg, db] = hexToRgb(frame.duotone?.[0] ?? "#1E1E1E");
  const [lr, lg, lb] = hexToRgb(frame.duotone?.[1] ?? frame.accent);
  const rand = seeded(`${frame.id}-texture`);
  const halfW = w / 2;
  const halfH = h / 2;
  const diag = Math.hypot(halfW, halfH);
  /* Corners start darkening 62% of the way out and reach 45% at the corner.
     Computed per pixel over the PHOTO — a photographic falloff, not a ramp
     painted on a UI surface (DESIGN.md §2.6). */
  const vigStart = 0.62;
  const vigDepth = 0.55;
  const levels = 5;
  /* Paper ruling period, in pixels, held to a constant fraction of the
     render so the texture looks the same in the preview and in the file. */
  const rulePeriod = Math.max(3, Math.round(h / 150));

  for (let i = 0; i < px.length; i += 4) {
    let r = px[i];
    let g = px[i + 1];
    let b = px[i + 2];

    if (effects.look === "mono") {
      r = g = b = luma(r, g, b);
    } else if (effects.look === "duotone") {
      const t = luma(r, g, b) / 255;
      r = dr + (lr - dr) * t;
      g = dg + (lg - dg) * t;
      b = db + (lb - db) * t;
    } else if (effects.look === "poster") {
      // Flat bands rather than a smooth range — screen-print, not photo.
      const q = 255 / (levels - 1);
      r = Math.round(r / q) * q;
      g = Math.round(g / q) * q;
      b = Math.round(b / q) * q;
    }

    if (effects.grain) {
      const n = (rand() - 0.5) * 46;
      r += n;
      g += n;
      b += n;
    }

    if (effects.paper) {
      const p = i >> 2;
      const x = p % w;
      const y = (p / w) | 0;
      /* Low-frequency fibre plus a faint press ruling, warmer than grain and
         deliberately much quieter. The ruling's PERIOD scales with the
         render: a fixed 7px period is invisible in a preview and reads as
         corduroy at 2160. */
      const fibre = Math.sin(x * 0.07 + y * 0.013) * 5;
      const rule = ((y % rulePeriod) - rulePeriod / 2) * 0.7;
      r += fibre + rule + 3;
      g += fibre + rule + 1;
      b += fibre + rule - 2;
    }

    if (effects.vignette) {
      const p = i >> 2;
      const dx = (p % w) - halfW;
      const dy = ((p / w) | 0) - halfH;
      const d = Math.hypot(dx, dy) / diag;
      if (d > vigStart) {
        const k = 1 - ((d - vigStart) / (1 - vigStart)) * vigDepth;
        r *= k;
        g *= k;
        b *= k;
      }
    }

    px[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    px[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  if (effects.look === "pixel") pixelate(image, w, h);

  ctx.putImageData(image, 0, 0);
}

/**
 * The edge treatment, applied as a mask.
 *
 * `clean` is the rounded rectangle the layout asks for. `torn` walks the
 * perimeter with seeded jitter, so the photo looks ripped out rather than
 * cropped. `brush` stamps overlapping tapered strokes and keeps only what
 * they cover, which leaves the ragged, slightly transparent ends a real
 * brush leaves.
 */
function applyEdge(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  radius: number,
  edge: DpEdge,
  seed: string,
) {
  const { canvas: maskCanvas, ctx: mask } = makeCanvas(w, h);
  mask.fillStyle = "#000";

  if (edge === "clean") {
    roundedRectPath(mask, 0, 0, w, h, radius);
    mask.fill();
  } else if (edge === "torn") {
    const rand = seeded(`${seed}-torn`);
    const amp = Math.min(w, h) * 0.022;
    const step = Math.min(w, h) * 0.028;
    const pts: [number, number][] = [];
    const side = (
      from: [number, number],
      to: [number, number],
      nx: number,
      ny: number,
    ) => {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const n = Math.max(3, Math.round(len / step));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const j = (rand() - 0.35) * amp;
        pts.push([
          from[0] + (to[0] - from[0]) * t + nx * j,
          from[1] + (to[1] - from[1]) * t + ny * j,
        ]);
      }
    };
    side([0, 0], [w, 0], 0, 1);
    side([w, 0], [w, h], -1, 0);
    side([w, h], [0, h], 0, -1);
    side([0, h], [0, 0], 1, 0);
    mask.beginPath();
    mask.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) mask.lineTo(x, y);
    mask.closePath();
    mask.fill();
  } else {
    const rand = seeded(`${seed}-brush`);
    mask.lineCap = "round";
    mask.strokeStyle = "#000";
    // Broad horizontal sweeps, each wandering a little, together covering
    // the middle and leaving the edges frayed.
    const rows = 12;
    for (let i = 0; i < rows; i++) {
      const y = (h / rows) * (i + 0.5);
      mask.lineWidth = (h / rows) * (1.05 + rand() * 0.75);
      mask.beginPath();
      mask.moveTo(-w * 0.01 + rand() * w * 0.13, y + (rand() - 0.5) * h * 0.03);
      mask.bezierCurveTo(
        w * 0.3,
        y + (rand() - 0.5) * h * 0.05,
        w * 0.7,
        y + (rand() - 0.5) * h * 0.05,
        w * 1.01 - rand() * w * 0.13,
        y + (rand() - 0.5) * h * 0.03,
      );
      mask.stroke();
    }
  }

  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

/** The photo, cropped, treated and masked, on its own transparent layer. */
function renderPhotoLayer(
  photo: ImageBitmap,
  box: Rect,
  radius: number,
  transform: DpTransform,
  effects: DpEffects,
  frame: DpFrame,
  shape: ShapeRecipe | null = null,
) {
  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingQuality = "high";
  drawCovered(ctx, photo, w, h, transform);

  geometricPass(ctx, w, h, effects);
  if (effects.look === "halftone") {
    halftonePhoto(
      ctx,
      w,
      h,
      frame.duotone?.[0] ?? "#1E1E1E",
      frame.duotone?.[1] ?? frame.background,
    );
  }
  if (effects.look === "mosaic") mosaicPhoto(ctx, w, h, frame.id);
  colourPass(ctx, w, h, effects, frame);
  if (shape) {
    // The shape IS the edge: cut the photo to it, nothing frayed on top.
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "#000";
    ctx.fill(shapePath(shape, fitShape(0, 0, w, h)));
    ctx.globalCompositeOperation = "source-over";
  } else {
    applyEdge(ctx, w, h, radius, effects.edge, frame.id);
  }
  return canvas;
}

/* ---------------------------------------------------------------- stickers */

/** The flat ink shadow every sticker carries, in the site's own language. */
function stickerShadow(u: number) {
  return { dx: u * 0.006, dy: u * 0.009 };
}

function drawShapeSticker(
  ctx: CanvasRenderingContext2D,
  sticker: ShapeSticker,
  size: number,
  u: number,
  shadowOnly = false,
) {
  const scale = size / 100;
  const stroke = Math.max(1.5, u * 0.0075) / scale;

  if (sticker.mark) {
    // The real brand asset, drawn from the shared path data. Its shadow is
    // the SAME paths in ink — a rectangle behind a logo made of four
    // separate pieces just looks like a grey box, which is what it was.
    const markScale = size / MARK_VIEWBOX.width;
    ctx.save();
    ctx.translate(-size / 2, (-MARK_VIEWBOX.height * markScale) / 2);
    ctx.scale(markScale, markScale);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1E1E1E";
    ctx.lineWidth = MARK_STROKE_WIDTH * 2.4;
    for (const { d, fill } of MARK_PATHS) {
      const path = new Path2D(d);
      ctx.fillStyle = shadowOnly ? "#1E1E1E" : fill;
      ctx.stroke(path);
      ctx.fill(path);
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(-size / 2, -size / 2);
  ctx.scale(scale, scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1E1E1E";
  ctx.lineWidth = stroke;
  for (const part of sticker.paths) {
    const path = new Path2D(part.d);
    if (part.fill === "none") {
      ctx.stroke(path);
      continue;
    }
    ctx.stroke(path);
    ctx.fillStyle = shadowOnly ? "#1E1E1E" : (part.fill ?? sticker.fill);
    ctx.fill(path);
  }
  ctx.restore();
}

function drawStickers(
  ctx: CanvasRenderingContext2D,
  layout: CardLayout,
  placed: PlacedSticker[],
  locale: "fr" | "en",
) {
  const u = layout.unit;
  const { dx, dy } = stickerShadow(u);

  /* KEPT ON THE CARD AT DRAW TIME. Clamping the stored position instead
     would need every control that can move a sticker to know how wide it
     renders — including the size slider, which changes the width after the
     fact. Doing it here means nothing can put a sticker off the edge. */
  const inside = (centre: number, half: number, extent: number) =>
    Math.min(extent - half, Math.max(half, centre));

  for (const item of placed) {
    const sticker = findSticker(item.stickerId);
    if (!sticker) continue;

    ctx.save();

    if (sticker.kind === "shape") {
      const size = STICKER_BASE * u * item.scale;
      const half = size * 0.62;
      ctx.translate(
        inside(item.x * layout.width, half, layout.width),
        inside(item.y * layout.height, half, layout.height),
      );
      ctx.rotate(item.rotation);
      // The shadow is the same shape, offset and flat — the site's chunky
      // shadow language, not a blur.
      ctx.save();
      ctx.translate(dx, dy);
      ctx.globalAlpha = 0.28;
      drawShapeSticker(ctx, sticker, size, u, true);
      ctx.restore();
      drawShapeSticker(ctx, sticker, size, u);
    } else {
      const text = sticker.text[locale];
      // Shrunk to fit rather than allowed to run off: a long phrase at a
      // large size would otherwise leave the card entirely.
      const maxW = layout.width * 0.82;
      let fontPx = STICKER_BASE * u * item.scale * 0.2;
      const font = (px: number) =>
        `700 ${Math.round(px)}px "Google Sans Code", ui-monospace, monospace`;
      ctx.font = font(fontPx);
      while (ctx.measureText(text).width + fontPx * 1.6 > maxW && fontPx > 8) {
        fontPx *= 0.94;
        ctx.font = font(fontPx);
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const padX = fontPx * 0.8;
      const w = ctx.measureText(text).width + padX * 2;
      const h = fontPx * 2.1;
      ctx.translate(
        inside(item.x * layout.width, w / 2, layout.width),
        inside(item.y * layout.height, h / 2, layout.height),
      );
      ctx.rotate(item.rotation);

      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#1E1E1E";
      roundedRectPath(ctx, -w / 2 + dx, -h / 2 + dy, w, h, h / 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = sticker.fill;
      ctx.strokeStyle = "#1E1E1E";
      ctx.lineWidth = Math.max(1.5, u * 0.0075);
      roundedRectPath(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = sticker.fill === "#1E1E1E" ? "#F0F0F0" : "#1E1E1E";
      ctx.fillText(text, 0, fontPx * 0.06);
    }
    ctx.restore();
  }
}

/**
 * Draws one sticker, centred, into a small canvas — for the picker.
 *
 * The chip shows the ACTUAL artwork rather than a label, which is the
 * difference between choosing a sticker and reading a list of nouns. It goes
 * through the same routine as the card, so a chip cannot show something the
 * card will not draw.
 */
export function drawStickerPreview(
  canvas: HTMLCanvasElement,
  stickerId: string,
  locale: "fr" | "en",
  px: number,
) {
  const sticker = findSticker(stickerId);
  if (!sticker) return;
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, px, px);
  ctx.save();
  ctx.translate(px / 2, px / 2);
  if (sticker.kind === "shape") {
    drawShapeSticker(ctx, sticker, px * 0.78, px * 3.6);
  } else {
    // Text stickers are wide; the chip shows the first word, upright.
    const word = sticker.text[locale].split(" ")[0];
    const fontPx = px * 0.26;
    ctx.font = `700 ${Math.round(fontPx)}px "Google Sans Code", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = Math.min(px * 0.94, ctx.measureText(word).width + fontPx);
    const h = fontPx * 2;
    ctx.fillStyle = sticker.fill;
    ctx.strokeStyle = "#1E1E1E";
    ctx.lineWidth = Math.max(1.5, px * 0.045);
    roundedRectPath(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = sticker.fill === "#1E1E1E" ? "#F0F0F0" : "#1E1E1E";
    ctx.fillText(word, 0, fontPx * 0.06, w - fontPx * 0.4);
  }
  ctx.restore();
}

/**
 * A shape sticker as a small, LOUD badge — the accent on the thank-you
 * hotspot cards (ADR 0098). Unlike the picker preview above it is drawn the
 * way a sticker sits on a DP card: a chunky ink outline and a flat ink
 * shadow, so it reads at 56px. `fill` recolours the sticker's main surface
 * (parts with their own colour keep it), so every card carries the theme
 * accent rather than five different colours.
 */
export function drawStickerBadge(
  canvas: HTMLCanvasElement,
  stickerId: string,
  px: number,
  fill?: string,
) {
  const found = findSticker(stickerId);
  if (!found || found.kind !== "shape") return;
  const sticker = fill ? { ...found, fill } : found;
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, px, px);
  const size = px * 0.76;
  // `u` sets the outline weight; a fixed share of the badge, not of a card.
  const u = px * 6;
  const shadow = px * 0.05;
  ctx.save();
  ctx.translate(px / 2 - shadow / 2 + shadow, px / 2 - shadow / 2 + shadow);
  drawShapeSticker(ctx, sticker, size, u, true);
  ctx.restore();
  ctx.save();
  ctx.translate(px / 2 - shadow / 2, px / 2 - shadow / 2);
  drawShapeSticker(ctx, sticker, size, u);
  ctx.restore();
}

/** Where a sticker's hit area is, in card fractions. Used by the crop stage. */
export function stickerRadius(item: PlacedSticker, ratio: DpRatio): number {
  void ratio;
  return (STICKER_BASE * item.scale) / 2;
}

/* ------------------------------------------------------------------- plate */

function drawPlate(
  ctx: CanvasRenderingContext2D,
  layout: CardLayout,
  frame: DpFrame,
  nickname: string,
  badgeText: string,
) {
  const { plate, platePad, unit: u } = layout;

  // The plate, with the radius the nesting rule gives it.
  ctx.save();
  ctx.fillStyle = frame.plate;
  // An ink plate (Midnight gold) gets a gold keyline — an ink one vanishes
  // wherever the plate overhangs the black card.
  ctx.strokeStyle = frame.plate === "#1E1E1E" ? frame.accent : "#1E1E1E";
  ctx.lineWidth = Math.max(2, u * 0.006);
  roundedRectPath(ctx, plate.x, plate.y, plate.w, plate.h, layout.radius.plate);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const left = plate.x + platePad;
  const inner = plate.w - platePad * 2;

  // The name. Left-aligned on the plate's own grid, and shrunk to fit rather
  // than squashed — a squashed name reads as a bug.
  const name = nickname.trim().slice(0, 28);
  const nameY = plate.y + plate.h * 0.38;
  if (name) {
    ctx.save();
    ctx.fillStyle = frame.foreground;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitFont(
      ctx,
      name,
      inner,
      (px) =>
        `700 ${Math.round(px)}px "Google Sans", "Product Sans", Inter, system-ui, sans-serif`,
      u * 0.085,
      u * 0.04,
    );
    ctx.fillText(name, left, nameY);
    ctx.restore();
  }

  // A hairline, then the lockup: the mark, the event, the chapter. This is
  // what makes a posted card unmistakably DevFest Yaoundé rather than a
  // pretty photo in a frame.
  const ruleY = plate.y + plate.h * 0.6;
  ctx.save();
  ctx.strokeStyle = frame.foreground;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(1, u * 0.0025);
  ctx.beginPath();
  ctx.moveTo(left, ruleY);
  ctx.lineTo(left + inner, ruleY);
  ctx.stroke();
  ctx.restore();

  const markH = u * 0.042;
  const markW = (markH / MARK_VIEWBOX.height) * MARK_VIEWBOX.width;
  const lockupY = plate.y + plate.h * 0.78;

  /* A paper chip behind the mark. Without it the yellow bracket vanished
     into a yellow plate — the piece was there, stroked, and read as an empty
     outline. Paper separates all four brand colours from any plate colour,
     and the ink keyline separates the chip from a pale one. */
  const chipPad = u * 0.014;
  ctx.save();
  ctx.fillStyle = "#F0F0F0";
  ctx.strokeStyle = "#1E1E1E";
  ctx.lineWidth = Math.max(1.5, u * 0.004);
  roundedRectPath(
    ctx,
    left - chipPad,
    lockupY - markH / 2 - chipPad,
    markW + chipPad * 2,
    markH + chipPad * 2,
    (markH + chipPad * 2) * 0.3,
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(left, lockupY - markH / 2);
  ctx.scale(markH / MARK_VIEWBOX.height, markH / MARK_VIEWBOX.height);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1E1E1E";
  ctx.lineWidth = MARK_STROKE_WIDTH * 1.6;
  for (const { d, fill } of MARK_PATHS) {
    const path = new Path2D(d);
    ctx.fillStyle = fill;
    ctx.stroke(path);
    ctx.fill(path);
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = frame.foreground;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const lockup = `${EVENT.name.toUpperCase()} ${EVENT.year}   ·   ${EVENT.organizer.toUpperCase()}`;
  fitFont(
    ctx,
    lockup,
    inner - markW - u * 0.036,
    (px) =>
      `600 ${Math.round(px)}px "Google Sans Code", ui-monospace, monospace`,
    u * 0.03,
    u * 0.016,
  );
  ctx.fillText(lockup, left + markW + u * 0.036, lockupY);
  ctx.restore();

  // The badge: a tag pinned to the plate's top edge, in the sticker's own
  // language — flat shadow, heavy outline — so it belongs to the card
  // instead of floating over it.
  if (badgeText) {
    ctx.save();
    ctx.translate(plate.x + plate.w - u * 0.13, plate.y);
    ctx.rotate(-0.05);
    ctx.font = `700 ${Math.round(u * 0.028)}px "Google Sans Code", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const padX = u * 0.03;
    const w = ctx.measureText(badgeText).width + padX * 2;
    const h = u * 0.068;
    const r = h * 0.34;

    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#1E1E1E";
    roundedRectPath(ctx, -w / 2 + u * 0.005, -h / 2 + u * 0.008, w, h, r);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = frame.accent;
    ctx.strokeStyle = "#1E1E1E";
    ctx.lineWidth = Math.max(2, u * 0.006);
    roundedRectPath(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = frame.accent === "#1E1E1E" ? "#F0F0F0" : "#1E1E1E";
    ctx.fillText(badgeText, 0, u * 0.002);
    ctx.restore();
  }
}

/* --------------------------------------------------------------- collector */

/**
 * The collector seal (ADR 0080) — the mark free cards cannot carry.
 *
 * A scalloped medallion pinned over the photo's top-right corner: a flat ink
 * offset shadow, a gold scalloped disc, an ink ring, the edition text set
 * around the ring, and a Gemini-style sparkle at its heart. Built only from
 * flat layers. Nothing personal on it — no tier, no serial, no name.
 */
function drawCollectorSeal(
  ctx: CanvasRenderingContext2D,
  layout: CardLayout,
  frame: DpFrame,
  locale: "fr" | "en",
) {
  const u = layout.unit;
  const r = u * 0.092;
  const cx = layout.photo.x + layout.photo.w - u * 0.035;
  const cy = layout.photo.y + u * 0.035;
  const ink = "#1E1E1E";
  const gold = frame.accent === ink ? "#F9AB00" : frame.accent;
  const scallop: ShapeRecipe = {
    kind: "polar",
    lobes: 16,
    depth: 0.07,
    sharpness: 0.8,
  };

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.21);

  // Shadow, then the scalloped disc with its outline.
  ctx.fillStyle = ink;
  ctx.fill(shapePath(scallop, { cx: u * 0.008, cy: u * 0.008, rx: r, ry: r }));
  const disc = shapePath(scallop, { cx: 0, cy: 0, rx: r, ry: r });
  ctx.fillStyle = gold;
  ctx.fill(disc);
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, u * 0.0045);
  ctx.stroke(disc);

  // Two rings: the text runs between them.
  ctx.lineWidth = Math.max(1, u * 0.0024);
  for (const ring of [0.8, 0.5]) {
    ctx.beginPath();
    ctx.arc(0, 0, r * ring, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The edition, set around the ring, one character at a time.
  const text = `${
    locale === "fr" ? "ÉDITION COLLECTOR" : "COLLECTOR EDITION"
  } · ${EVENT.name.toUpperCase()} ${EVENT.year} · `;
  const chars = [...text];
  const textR = r * 0.65;
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.round(u * 0.0135)}px "Google Sans Code", ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const step = (Math.PI * 2) / chars.length;
  chars.forEach((ch, i) => {
    ctx.save();
    ctx.rotate(i * step - Math.PI / 2);
    ctx.translate(textR, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });

  // The heart: a sparkle with a smaller one beside it.
  ctx.fill(
    shapePath(
      { kind: "sparkle", fullness: 0.18 },
      { cx: 0, cy: 0, rx: r * 0.36, ry: r * 0.36 },
    ),
  );
  ctx.fill(
    shapePath(
      { kind: "sparkle", fullness: 0.18 },
      { cx: r * 0.27, cy: -r * 0.24, rx: r * 0.11, ry: r * 0.11 },
    ),
  );
  ctx.restore();
}

/* ------------------------------------------------------------------ render */

/**
 * Renders the whole card. Exposed separately from `composeDp` so the live
 * preview can draw into an on-screen canvas at a smaller size without
 * producing a Blob on every pointer move.
 */
export function renderDp(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  input: DpComposeInput,
): void {
  const width = input.size ?? DP_SIZE;
  const ratio = input.ratio ?? "1:1";
  const frame = input.frame ?? findFrame(input.frameId ?? DEFAULT_FRAME_ID);
  if (!frame) throw new Error(`unknown frame: ${input.frameId}`);

  const layout = layoutCard(width, ratio, input.corners ?? "rounded");
  canvas.width = layout.width;
  canvas.height = layout.height;

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("2d canvas context unavailable");

  const transform = input.transform ?? DEFAULT_TRANSFORM;
  const effects = input.effects ?? DEFAULT_EFFECTS;
  const locale = input.locale ?? "fr";

  ctx.clearRect(0, 0, layout.width, layout.height);

  // 1. The card: ground, pattern, ink edge — all clipped to the outer radius.
  ctx.save();
  roundedRectPath(ctx, 0, 0, layout.width, layout.height, layout.radius.card);
  ctx.clip();
  ctx.fillStyle = frame.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawPattern({
    ctx,
    frame,
    w: layout.width,
    h: layout.height,
    u: layout.unit,
  });
  ctx.restore();

  // 2. The photo, already masked by its edge treatment. A shaped photo
  //    first gets the site's flat ink offset shadow, so it sits ON the card.
  //
  //    A shape's curves leave far more empty card than a rounded rectangle
  //    does, so a shaped photo gets a bigger box: it grows into the padding,
  //    stopping a thin margin short of the card's edge. Pan and zoom are
  //    fractions of the box, so the framing carries over unchanged.
  const grow = input.shape ? layout.unit * SHAPE_GROW : 0;
  const photoBox: Rect = {
    x: layout.photo.x - grow,
    y: layout.photo.y - grow,
    w: layout.photo.w + grow * 2,
    h: layout.photo.h + grow * 2,
  };
  const shapeBox = input.shape
    ? fitShape(photoBox.x, photoBox.y, photoBox.w, photoBox.h)
    : null;
  if (input.shape && shapeBox) {
    const off = layout.unit * 0.014;
    ctx.fillStyle = "#1E1E1E";
    ctx.fill(
      shapePath(input.shape, {
        ...shapeBox,
        cx: shapeBox.cx + off,
        cy: shapeBox.cy + off,
      }),
    );
  }
  ctx.drawImage(
    renderPhotoLayer(
      input.photo,
      photoBox,
      layout.radius.photo,
      transform,
      effects,
      frame,
      input.shape ?? null,
    ),
    photoBox.x,
    photoBox.y,
    photoBox.w,
    photoBox.h,
  );

  // A shaped photo gets its keyline along the shape.
  if (input.shape) {
    ctx.save();
    ctx.strokeStyle = "#1E1E1E";
    ctx.lineWidth = Math.max(2, layout.unit * 0.006);
    ctx.lineJoin = "round";
    ctx.stroke(shapePath(input.shape, shapeBox!));
    ctx.restore();
  }
  // A clean edge gets an ink keyline; a torn or brushed one must not, or the
  // rectangle it was supposed to escape is drawn straight back on.
  else if (effects.edge === "clean") {
    ctx.save();
    ctx.strokeStyle = "#1E1E1E";
    ctx.lineWidth = Math.max(2, layout.unit * 0.006);
    roundedRectPath(
      ctx,
      layout.photo.x,
      layout.photo.y,
      layout.photo.w,
      layout.photo.h,
      layout.radius.photo,
    );
    ctx.stroke();
    ctx.restore();
  }

  // 3. A few pattern pieces in FRONT of the photo, so the card holds it
  //    rather than the photo simply covering the card.
  drawOverspill({
    ctx,
    frame,
    w: layout.width,
    h: layout.height,
    u: layout.unit,
    photo: layout.photo,
  });

  // 4. Stickers, over the photo but under the branding.
  if (input.stickers?.length) {
    drawStickers(ctx, layout, input.stickers, locale);
  }

  // 5. The plate: name, lockup, badge.
  const badge = findBadge(input.badgeId ?? DEFAULT_BADGE_ID);
  const badgeText = input.badgeText?.trim()
    ? input.badgeText.trim().toUpperCase()
    : (badge?.text[locale] ?? "");
  drawPlate(ctx, layout, frame, input.nickname, badgeText);

  // 5b. Collector frames only: the seal.
  if (frame.collector) drawCollectorSeal(ctx, layout, frame, locale);

  // 6. The card's own outline, last, so nothing sits on top of it.
  ctx.save();
  ctx.strokeStyle = "#1E1E1E";
  ctx.lineWidth = Math.max(2, layout.unit * 0.008);
  roundedRectPath(
    ctx,
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    layout.width - ctx.lineWidth,
    layout.height - ctx.lineWidth,
    layout.radius.card,
  );
  ctx.stroke();
  ctx.restore();
}

/**
 * Renders and hands back a PNG Blob, ready for a download link.
 *
 * Waits for fonts first. Canvas bakes whatever face was loaded at draw time
 * and never reflows, so composing before the webfont resolves exports a card
 * set in the fallback — the one place where the file would not match the
 * preview the person just approved.
 */
export async function composeDp(input: DpComposeInput): Promise<Blob> {
  const width = input.size ?? DP_SIZE;
  const height = cardHeight(width, input.ratio ?? "1:1");
  try {
    await document.fonts?.ready;
  } catch {
    // A browser without the Font Loading API still renders, just in whatever
    // it has. Not a reason to refuse the download.
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    renderDp(canvas, input);
    return canvas.convertToBlob({ type: "image/png" });
  }

  const canvas = document.createElement("canvas");
  renderDp(canvas, input);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("canvas produced no blob")),
      "image/png",
    );
  });
}

/** Filename for the download. Kept ASCII-safe for awkward mobile browsers. */
export function dpFileName(nickname: string): string {
  const slug =
    nickname
      .normalize("NFD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 32) || "devfest";
  return `devfest-yaounde-${slug}.png`;
}
