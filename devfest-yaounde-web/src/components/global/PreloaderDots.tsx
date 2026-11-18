"use client";

import { useEffect, useRef } from "react";

/** Distance between dot centres, and the dot's own radius, in CSS pixels. */
const SPACING = 30;
const RADIUS = 3.4;
/** The whole field leans, so the grid never reads as a spreadsheet. */
const TILT_DEG = -11;
/** Resting opacity, and the opacity under the middle of the highlight. */
const BASE_ALPHA = 0.1;
const PEAK_ALPHA = 0.92;

/**
 * The dot field — behind the preloader, and over the hero's photograph.
 *
 * THE DOTS NEVER CHANGE COLOUR. They are ink, always, and what animates is
 * their OPACITY: a soft highlight drifts around the field and the dots under
 * it come up. That is the whole effect — a spotlight wandering over a printed
 * halftone, not a colour cycle.
 *
 * Canvas rather than CSS: the pattern itself could be a repeating radial
 * gradient, but gradients are banned as design surfaces (DESIGN.md §2.6) and
 * a per-dot opacity falloff is not something a background-image can express
 * anyway. A few hundred `arc` calls a frame is nothing.
 *
 * The drift is a sum of sines rather than a random walk — it never repeats on
 * a human timescale, it never jumps, and it needs no state between frames.
 *
 * ## Two callers, three differences
 *
 * The hero reuses this rather than growing a second dot field, which needed
 * three things the preloader never did:
 *
 * - **It sizes to its PARENT, not the window.** The preloader's parent is the
 *   viewport, so nothing changes there; the hero's is a section that is taller
 *   than one screen once the banner is up. A `ResizeObserver` on the canvas
 *   replaces `window.innerWidth`.
 * - **`follow` points the highlight at the CURSOR** instead of drifting it on
 *   a timer. Eased, not snapped — a highlight that tracks the pointer exactly
 *   reads as a flashlight, and the point is a spotlight wandering over a
 *   printed halftone. With no pointer yet it keeps drifting, so it is never
 *   parked in a corner waiting to be found.
 * - **`ink` sets the dot colour**, because "always ink" stops being right the
 *   moment the field is over a photograph rather than the pastel ground.
 *
 * ## It stops when nobody can see it
 *
 * The preloader's copy answered this by unmounting after a second and a half.
 * The hero's does not unmount — it sits at the top of a long page, and
 * without this it would hold a `requestAnimationFrame` open for as long as
 * the tab did, redrawing a few hundred arcs a frame at the bottom of the
 * FAQs. An `IntersectionObserver` cancels the loop when the field scrolls out
 * of view and restarts it when it comes back.
 */
export function PreloaderDots({
  calm,
  follow = false,
  ink = "#1E1E1E",
  base = BASE_ALPHA,
  peak = PEAK_ALPHA,
}: {
  calm: boolean;
  /** Resting and highlight opacity — lower both for a gentler field. */
  base?: number;
  peak?: number;
  /** Point the highlight at the pointer instead of drifting it. */
  follow?: boolean;
  ink?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* Where the pointer is, in canvas space — null until it has been seen. */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /* Where the highlight actually is, eased toward wherever it wants to be. */
  const highlight = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      /* The canvas is `absolute inset-0`, so its own box IS the parent's. */
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(box.width)) || window.innerWidth;
      height = Math.max(1, Math.round(box.height)) || window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      /* Where the highlight is right now. Two sines per axis, at
         deliberately unrelated periods, so the path never closes into a
         visible loop. Under reduced motion it simply parks. */
      const s = calm ? 0 : t / 1000;
      const driftX =
        width * (0.5 + 0.34 * Math.sin(s * 0.31) + 0.1 * Math.sin(s * 0.73));
      const driftY =
        height * (0.5 + 0.3 * Math.cos(s * 0.24) + 0.11 * Math.sin(s * 0.61));

      /* Ease toward the pointer when there is one, otherwise keep drifting.
         The lerp is what turns "follows the mouse" into "is drawn toward the
         mouse", which is the difference between a flashlight and a spotlight. */
      const wantX = follow && pointer.current ? pointer.current.x : driftX;
      const wantY = follow && pointer.current ? pointer.current.y : driftY;
      if (calm) {
        highlight.current = { x: wantX, y: wantY };
      } else {
        highlight.current.x += (wantX - highlight.current.x) * 0.06;
        highlight.current.y += (wantY - highlight.current.y) * 0.06;
      }
      const hx = highlight.current.x;
      const hy = highlight.current.y;
      const reach = Math.max(width, height) * 0.34;

      ctx.save();
      // Tilt the field about the middle, and over-draw past every edge so the
      // rotation never exposes a bare corner.
      ctx.translate(width / 2, height / 2);
      ctx.rotate((TILT_DEG * Math.PI) / 180);
      ctx.translate(-width / 2, -height / 2);

      const bleed = Math.ceil(Math.max(width, height) * 0.25);
      ctx.fillStyle = ink;

      for (let y = -bleed; y < height + bleed; y += SPACING) {
        for (let x = -bleed; x < width + bleed; x += SPACING) {
          /* The highlight lives in SCREEN space, so it drifts across the
             tilted grid rather than with it — the field stays still and the
             light moves over it, which is the point. */
          const px = x - width / 2;
          const py = y - height / 2;
          const cos = Math.cos((-TILT_DEG * Math.PI) / 180);
          const sin = Math.sin((-TILT_DEG * Math.PI) / 180);
          const sx = px * cos - py * sin + width / 2;
          const sy = px * sin + py * cos + height / 2;

          const d = Math.hypot(sx - hx, sy - hy);
          const fall = Math.max(0, 1 - d / reach);
          ctx.globalAlpha = base + (peak - base) * fall * fall;

          ctx.beginPath();
          ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    resize();
    // Start the highlight where the drift would have put it, so the first
    // frame is never a spotlight sitting in the top-left corner.
    highlight.current = { x: width / 2, y: height / 2 };
    draw(0);

    /* The box is the parent's, so `window.resize` is the wrong signal — a
       dismissed announcement banner changes this element's height without
       changing the window's. */
    const observer = new ResizeObserver(() => {
      resize();
      if (calm) draw(0);
    });
    observer.observe(canvas);

    const onPointerMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer.current = {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      };
    };
    if (follow && !calm) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    if (calm) {
      // One frame, and nothing moves. Still branded, still legible.
      return () => {
        observer.disconnect();
        window.removeEventListener("pointermove", onPointerMove);
      };
    }

    const loop = (t: number) => {
      draw(t);
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (frame === 0) frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
    };

    /* No IntersectionObserver is not a reason to not animate — draw anyway. */
    let visibility: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") {
      start();
    } else {
      visibility = new IntersectionObserver(
        (entries) => (entries.some((e) => e.isIntersecting) ? start() : stop()),
        { threshold: 0 },
      );
      visibility.observe(canvas);
    }

    return () => {
      stop();
      observer.disconnect();
      visibility?.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [calm, follow, ink, base, peak]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 h-full w-full"
    />
  );
}
