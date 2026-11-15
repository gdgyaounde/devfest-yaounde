/**
 * DP generator — background patterns.
 *
 * Eight routines, one signature. Each fills the whole card and reads its
 * colours from the style, so any style can use any pattern and a new
 * combination costs one line in `frames.ts`.
 *
 * Everything is FLAT (DESIGN.md §2.6). The craft comes from shape, weight and
 * repetition — there is not a single colour ramp in here, including in `rays`,
 * which is wedges of solid colour rather than a radial sweep.
 */
import type { DpFrame, DpPattern } from "./frames";

/**
 * A tiny deterministic generator, seeded from the style id.
 *
 * The pattern has to land in the same place on every render: `Math.random`
 * would reshuffle it on each pointer move during a drag, and the exported
 * file would not match the preview the person approved.
 */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

interface PatternArgs {
  ctx: CanvasRenderingContext2D;
  frame: DpFrame;
  /** Card size in pixels. */
  w: number;
  h: number;
  /** The unit every length is expressed in — the card's width. */
  u: number;
}

function colours(frame: DpFrame): string[] {
  return frame.palette?.length ? frame.palette : [frame.accent];
}

/* ------------------------------------------------------------------ shapes */

function chevron(ctx: CanvasRenderingContext2D, s: number) {
  ctx.lineWidth = s * 0.28;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-s / 2, -s / 2);
  ctx.lineTo(s / 2, 0);
  ctx.lineTo(-s / 2, s / 2);
  ctx.stroke();
}

function fourPointStar(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.quadraticCurveTo(0, 0, 0, r);
  ctx.quadraticCurveTo(0, 0, -r, 0);
  ctx.quadraticCurveTo(0, 0, 0, -r);
  ctx.fill();
}

/* ---------------------------------------------------------------- patterns */

function confetti({ ctx, frame, w, h, u }: PatternArgs) {
  const rand = seeded(`${frame.id}-confetti`);
  const palette = colours(frame);
  const count = Math.round(((w * h) / (u * u)) * 52);
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const s = u * (0.016 + rand() * 0.024);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    const colour =
      palette[Math.floor(rand() * palette.length) % palette.length];
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    const shape = Math.floor(rand() * 4);
    if (shape === 0) {
      roundedRectPath(ctx, -s / 2, -s / 4, s, s / 2, s * 0.22);
      ctx.fill();
    } else if (shape === 1) {
      ctx.beginPath();
      ctx.arc(0, 0, s / 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 2) {
      chevron(ctx, s);
    } else {
      fourPointStar(ctx, s / 2);
    }
    ctx.restore();
  }
}

function terrazzo({ ctx, frame, w, h, u }: PatternArgs) {
  const rand = seeded(`${frame.id}-terrazzo`);
  const palette = colours(frame);
  const chips = Math.round(((w * h) / (u * u)) * 90);
  for (let i = 0; i < chips; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const s = u * (0.012 + rand() * 0.026);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle =
      palette[Math.floor(rand() * palette.length) % palette.length];
    // Irregular quadrilaterals, the way real terrazzo chips break.
    ctx.beginPath();
    ctx.moveTo(-s * (0.4 + rand() * 0.3), -s * (0.3 + rand() * 0.3));
    ctx.lineTo(s * (0.3 + rand() * 0.4), -s * (0.4 + rand() * 0.2));
    ctx.lineTo(s * (0.4 + rand() * 0.2), s * (0.3 + rand() * 0.3));
    ctx.lineTo(-s * (0.3 + rand() * 0.3), s * (0.4 + rand() * 0.2));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Ink speckle, which is what stops it reading as scattered sweets.
  ctx.fillStyle = "#1E1E1E";
  for (let i = 0; i < chips * 2; i++) {
    ctx.beginPath();
    ctx.arc(
      rand() * w,
      rand() * h,
      u * (0.001 + rand() * 0.0035),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function halftone({ ctx, frame, w, h, u }: PatternArgs) {
  const step = u * 0.03;
  const maxR = step * 0.42;
  const palette = colours(frame);
  const diag = Math.hypot(w, h);
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      // Dots thin out from the bottom-left, so the card has a direction.
      const t = Math.hypot(x, h - y) / diag;
      const r = maxR * Math.max(0, 1 - t * 1.35);
      if (r < maxR * 0.1) continue;
      ctx.fillStyle =
        palette[(Math.round(x / step) + Math.round(y / step)) % palette.length];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function checker({ ctx, frame, w, h, u }: PatternArgs) {
  const cell = u * 0.115;
  const r = cell * 0.28;
  const palette = colours(frame);
  let row = 0;
  for (let y = -cell; y < h + cell; y += cell) {
    let col = 0;
    for (let x = -cell; x < w + cell; x += cell) {
      if ((row + col) % 2 === 0) {
        ctx.fillStyle = palette[(row + col) % palette.length];
        // Rounded squares, offset a little each row so it is a pattern
        // rather than a spreadsheet.
        roundedRectPath(
          ctx,
          x + (row % 2 ? cell * 0.18 : 0),
          y,
          cell * 0.92,
          cell * 0.92,
          r,
        );
        ctx.fill();
      }
      col++;
    }
    row++;
  }
}

function waves({ ctx, frame, w, h, u }: PatternArgs) {
  const palette = colours(frame);
  const band = u * 0.085;
  ctx.lineCap = "round";
  let i = 0;
  for (let y = -band; y < h + band * 2; y += band) {
    ctx.strokeStyle = palette[i % palette.length];
    ctx.lineWidth = band * (0.3 + (i % 3) * 0.08);
    ctx.beginPath();
    const amp = band * 0.55;
    const wl = u * 0.34;
    ctx.moveTo(-band, y);
    for (let x = -band; x <= w + band; x += wl / 8) {
      ctx.lineTo(x, y + Math.sin((x / wl) * Math.PI * 2 + i * 0.7) * amp);
    }
    ctx.stroke();
    i++;
  }
}

function grid({ ctx, frame, w, h, u }: PatternArgs) {
  const minor = u * 0.045;
  const palette = colours(frame);
  ctx.strokeStyle = palette[0];
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(1, u * 0.0022);
  ctx.beginPath();
  for (let x = 0; x <= w; x += minor) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += minor) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Heavier rules every fifth line, and ticks where they cross — the thing
  // that makes a grid read as drafting paper rather than as graph paper.
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(1, u * 0.0045);
  ctx.beginPath();
  for (let x = 0; x <= w; x += minor * 5) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += minor * 5) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = palette[1] ?? palette[0];
  const tick = u * 0.008;
  for (let x = 0; x <= w; x += minor * 5) {
    for (let y = 0; y <= h; y += minor * 5) {
      ctx.fillRect(x - tick / 2, y - tick / 8, tick, tick / 4);
      ctx.fillRect(x - tick / 8, y - tick / 2, tick / 4, tick);
    }
  }
}

function rays({ ctx, frame, w, h, u }: PatternArgs) {
  const palette = colours(frame);
  const cx = w * 0.5;
  const cy = h * 1.02;
  const radius = Math.hypot(w, h) * 1.2;
  const wedges = 22;
  for (let i = 0; i < wedges; i++) {
    if (i % 2) continue;
    const a0 = Math.PI + (i / wedges) * Math.PI;
    const a1 = Math.PI + ((i + 1) / wedges) * Math.PI;
    ctx.fillStyle = palette[(i / 2) % palette.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  // A flat band across the base, so the wedges have something to sit on.
  ctx.fillStyle = palette[palette.length - 1];
  ctx.fillRect(0, h - u * 0.03, w, u * 0.03);
  void u;
}

function tiles({ ctx, frame, w, h, u }: PatternArgs) {
  const cell = u * 0.075;
  const palette = colours(frame);
  let row = 0;
  for (let y = -cell; y < h + cell; y += cell) {
    let col = 0;
    for (let x = -cell; x < w + cell; x += cell) {
      const c = (row * 3 + col * 5) % 7;
      if (c < 3) {
        ctx.fillStyle = palette[c % palette.length];
        const inset = cell * 0.12;
        roundedRectPath(
          ctx,
          x + inset,
          y + inset,
          cell - inset * 2,
          cell - inset * 2,
          // Quarter-round on alternating corners gives the tiling a weave.
          (row + col) % 2 ? cell * 0.42 : cell * 0.14,
        );
        ctx.fill();
      }
      col++;
    }
    row++;
  }
}

/* --------------------------------------------------- collector (ADR 0077) */
/*
 * These two routines ship in the public bundle, and that is fine: without a
 * frame definition — which only `/api/dp/collector-frames` hands out, to
 * paid pass holders — nothing ever selects them.
 */

/**
 * GOLD FOIL. Deep black ground and flat metallic-yellow line work: art-deco
 * fans of concentric arcs from each corner, and a double foil rule just
 * inside the card edge. No ramp anywhere — the "metal" is two flat yellows
 * alternating line by line.
 */
function foil({ ctx, frame, w, h, u }: PatternArgs) {
  const palette = colours(frame);
  const step = u * 0.022;
  const line = Math.max(1, u * 0.0035);
  const corners: [number, number, number][] = [
    [0, 0, 0],
    [w, 0, Math.PI / 2],
    [w, h, Math.PI],
    [0, h, (3 * Math.PI) / 2],
  ];
  ctx.lineWidth = line;
  for (const [cx, cy, start] of corners) {
    for (let i = 1; i <= 9; i++) {
      ctx.strokeStyle = palette[i % palette.length];
      ctx.beginPath();
      ctx.arc(cx, cy, step * i * 1.6, start, start + Math.PI / 2);
      ctx.stroke();
    }
    // Rays between the arcs — the fan's ribs.
    for (let k = 1; k < 6; k++) {
      const a = start + (k / 6) * (Math.PI / 2);
      ctx.strokeStyle = palette[0];
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * step * 1.6, cy + Math.sin(a) * step * 1.6);
      ctx.lineTo(
        cx + Math.cos(a) * step * 14.4,
        cy + Math.sin(a) * step * 14.4,
      );
      ctx.stroke();
    }
  }
  // The double foil rule.
  for (const [inset, colour] of [
    [u * 0.022, palette[0]],
    [u * 0.034, palette[palette.length - 1]],
  ] as const) {
    ctx.strokeStyle = colour;
    roundedRectPath(ctx, inset, inset, w - inset * 2, h - inset * 2, u * 0.11);
    ctx.stroke();
  }
  // Diamond studs on the edge midpoints.
  ctx.fillStyle = palette[0];
  for (const [x, y] of [
    [w / 2, u * 0.028],
    [w / 2, h - u * 0.028],
    [u * 0.028, h / 2],
    [w - u * 0.028, h / 2],
  ]) {
    const s = u * 0.012;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * TICKET STUB. The card IS the ticket: fine security pinstripes, and down
 * the right-hand margin a perforated tear line with die-cut notches top and
 * bottom. The serial strip printed beside it is drawn by the compositor
 * (`drawCollectorDetails`), because it needs the holder's tier and name.
 */
function stub({ ctx, frame, w, h, u }: PatternArgs) {
  const palette = colours(frame);
  // Security print: hairline pinstripes, alternating weight.
  ctx.strokeStyle = palette[0];
  for (let y = u * 0.012, i = 0; y < h; y += u * 0.014, i++) {
    ctx.lineWidth = Math.max(1, u * (i % 3 === 0 ? 0.0028 : 0.0012));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const tearX = w - u * 0.05;
  // A die-cut notch on the left edge, so the stub reads as punched, not
  // just striped. (Not at the tear line's ends: those fall inside the card's
  // rounded corners and were clipped away.)
  ctx.fillStyle = "#1E1E1E";
  ctx.beginPath();
  ctx.arc(0, h * 0.5, u * 0.03, 0, Math.PI * 2);
  ctx.fill();
  // The perforation: a column of round holes.
  for (let y = u * 0.06; y < h - u * 0.05; y += u * 0.026) {
    ctx.beginPath();
    ctx.arc(tearX, y, u * 0.0065, 0, Math.PI * 2);
    ctx.fill();
  }
}

const PATTERNS = {
  confetti,
  terrazzo,
  halftone,
  checker,
  waves,
  grid,
  rays,
  tiles,
  foil,
  stub,
} as const;

export function drawPattern(args: PatternArgs) {
  const { ctx, frame } = args;
  ctx.save();
  PATTERNS[frame.pattern](args);
  ctx.restore();
}

/** Patterns made of loose pieces, which can believably fall in FRONT. */
const SCATTERED: DpPattern[] = ["confetti", "terrazzo"];

/**
 * A handful of pattern pieces drawn OVER the photo's corners.
 *
 * It is a small thing that does a lot: the photo stops being a rectangle
 * pasted on a background and starts being something the card is holding.
 * Only the scattered patterns get it — a checkerboard spilling over a
 * photograph would just look like a mistake.
 */
export function drawOverspill({
  ctx,
  frame,
  w,
  h,
  u,
  photo,
}: PatternArgs & { photo: { x: number; y: number; w: number; h: number } }) {
  if (!SCATTERED.includes(frame.pattern)) return;
  const rand = seeded(`${frame.id}-spill`);
  const palette = colours(frame);
  const corners = [
    [photo.x, photo.y],
    [photo.x + photo.w, photo.y],
    [photo.x, photo.y + photo.h],
    [photo.x + photo.w, photo.y + photo.h],
  ];
  ctx.save();
  for (const [cx, cy] of corners) {
    const pieces = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < pieces; i++) {
      const x = cx + (rand() - 0.5) * u * 0.16;
      const y = cy + (rand() - 0.5) * u * 0.16;
      const s = u * (0.02 + rand() * 0.026);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rand() * Math.PI);
      const colour =
        palette[Math.floor(rand() * palette.length) % palette.length];
      ctx.fillStyle = colour;
      ctx.strokeStyle = colour;
      if (rand() > 0.5) {
        roundedRectPath(ctx, -s / 2, -s / 4, s, s / 2, s * 0.22);
        ctx.fill();
      } else {
        chevron(ctx, s);
      }
      ctx.restore();
    }
  }
  ctx.restore();
  void w;
  void h;
}
