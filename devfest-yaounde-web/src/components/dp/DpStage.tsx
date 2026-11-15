"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  photoBoxUnits,
  renderDp,
  type DpCorners,
  type DpEffects,
  type DpRatio,
  type DpTransform,
} from "@/lib/dp/compose";
import { STICKER_BASE, type PlacedSticker } from "@/lib/dp/stickers";
import { clampTransform, overshootOf, type Box } from "./pan";
import type { DpFrame } from "@/lib/dp/frames";

/**
 * Resolution the PREVIEW is drawn at — not the download, which is DP_SIZE or
 * twice that. 760 is sharp on a 2x display at the size this box occupies, and
 * cheap enough to redraw on every pointer move.
 */
const PREVIEW_WIDTH = 760;

/** Arrow-key pan, as a fraction of the photo box. Shift makes it finer. */
const KEY_PAN_STEP = 0.02;
const KEY_ZOOM_STEP = 0.08;
/** Arrow-key nudge for a selected sticker, as a fraction of the card. */
const STICKER_KEY_STEP = 0.012;

/** How much of a drag past the limit shows as stretch. 0.35 = heavy rubber. */
const RUBBER = 0.35;
/** Tilt at the very corner of the card, in degrees. */
const TILT_MAX = 9;

export interface DpStageProps {
  photo: ImageBitmap;
  frameId: string;
  /** A resolved collector frame (ADR 0077); overrides the catalog lookup. */
  frame?: DpFrame;
  nickname: string;
  transform: DpTransform;
  onTransformChange: (next: DpTransform) => void;
  effects: DpEffects;
  badgeId: string;
  ratio: DpRatio;
  corners: DpCorners;
  stickers: PlacedSticker[];
  onStickersChange: (next: PlacedSticker[]) => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
  locale: "fr" | "en";
  /** Describes the render for screen readers — the canvas has no text. */
  label: string;
  /** Id of the visible drag/keys hint, wired up as the description. */
  hintId: string;
  /** True when the visitor asked for less motion: no tilt, no spring. */
  calm: boolean;
}

/**
 * The live preview, the crop control and the sticker board, all at once.
 *
 * There is no separate "cropper" and "preview" — the thing you drag IS the
 * card you are about to download, at the same proportions, with the name, the
 * branding and the stickers already on it. A crop box that shows a bare photo
 * and then hands back a differently-composed card makes people re-do the
 * framing after they see the result.
 *
 * Drag is Pointer Events, so mouse, touch and pen are one code path. Pointer
 * capture is taken on the way down: without it, dragging quickly enough to
 * leave the canvas drops the gesture halfway.
 *
 * WHAT A DRAG DOES depends on what is under it. A sticker moves; anything
 * else pans the photo. That rule is the whole interaction model, and it is
 * what lets one surface do both jobs without a mode switch.
 *
 * `touch-action: none` is set here and nowhere else. It is what stops a
 * finger drag from scrolling the page instead of moving the photo, and it is
 * scoped to the canvas so the rest of the screen scrolls normally.
 */
export function DpStage({
  photo,
  frameId,
  frame,
  nickname,
  transform,
  onTransformChange,
  effects,
  badgeId,
  ratio,
  corners,
  stickers,
  onStickersChange,
  selected,
  onSelect,
  locale,
  label,
  hintId,
  calm,
}: DpStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    from: DpTransform;
    sticker: string | null;
    fromSticker: { x: number; y: number } | null;
  } | null>(null);
  const spring = useRef<number>(0);

  /** Live rubber-band offset, in CSS pixels. Not state — it drives a style. */
  const [stretch, setStretch] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      renderDp(canvas, {
        photo,
        frameId,
        frame,
        nickname,
        transform,
        effects,
        badgeId,
        ratio,
        corners,
        stickers,
        locale,
        size: PREVIEW_WIDTH,
      });
    };

    draw();
    /* Canvas text does not re-flow when a webfont arrives the way DOM text
       does — whatever was loaded at draw time is baked into the pixels. One
       redraw once fonts are ready keeps the preview from being the only place
       on the page still showing the fallback face. */
    document.fonts?.ready.then(draw);

    return () => {
      cancelled = true;
    };
  }, [
    photo,
    frameId,
    frame,
    nickname,
    transform,
    effects,
    badgeId,
    ratio,
    corners,
    stickers,
    locale,
  ]);

  useEffect(() => () => cancelAnimationFrame(spring.current), []);

  /** The photo box in CSS pixels, from the same constants the card is drawn with. */
  function boxOf(el: HTMLCanvasElement): Box {
    const cardW = el.getBoundingClientRect().width;
    const units = photoBoxUnits(ratio);
    return { w: cardW * units.w, h: cardW * units.h };
  }

  /** Which sticker is under this point, topmost first. */
  function stickerAt(el: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = el.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const aspect = rect.height / rect.width;
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i];
      // Hit area in card-width units, so a 3:4 card does not distort it.
      const r = (STICKER_BASE * s.scale) / 2 + 0.02;
      const dx = fx - s.x;
      const dy = (fy - s.y) * aspect;
      if (Math.hypot(dx, dy) <= r) return s;
    }
    return null;
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary) return;
    cancelAnimationFrame(spring.current);
    const hit = stickerAt(e.currentTarget, e.clientX, e.clientY);
    onSelect(hit?.key ?? null);
    drag.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      from: transform,
      sticker: hit?.key ?? null,
      fromSticker: hit ? { x: hit.x, y: hit.y } : null,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();

    if (active.sticker && active.fromSticker) {
      const next = stickers.map((s) =>
        s.key === active.sticker
          ? {
              ...s,
              x: Math.min(
                1,
                Math.max(
                  0,
                  active.fromSticker!.x + (e.clientX - active.x) / rect.width,
                ),
              ),
              y: Math.min(
                1,
                Math.max(
                  0,
                  active.fromSticker!.y + (e.clientY - active.y) / rect.height,
                ),
              ),
            }
          : s,
      );
      onStickersChange(next);
      return;
    }

    /* Pan is measured against the DISPLAYED box, so a photo tracks the finger
       1:1 at any screen size. */
    const box = boxOf(e.currentTarget);
    if (box.w <= 0) return;

    const wanted: DpTransform = {
      scale: active.from.scale,
      offsetX: active.from.offsetX + (e.clientX - active.x) / box.w,
      offsetY: active.from.offsetY + (e.clientY - active.y) / box.h,
    };
    const clamped = clampTransform(photo, wanted, box);
    onTransformChange(clamped);

    /* THE STRETCH. Past the limit the crop stops moving, which on its own
       feels like the drag broke. Letting the card follow a fraction of the
       extra distance says "there is nothing more here" in the language of
       every touch surface people already use. */
    if (!calm) {
      const over = overshootOf(photo, wanted, box);
      setStretch({ x: over.x * box.w * RUBBER, y: over.y * box.h * RUBBER });
    }
  };

  const endDrag = (e: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    releaseSpring();
  };

  /** Settle the rubber band with a little overshoot, then stop. */
  function releaseSpring() {
    cancelAnimationFrame(spring.current);
    setStretch((current) => {
      if (calm || (Math.abs(current.x) < 0.5 && Math.abs(current.y) < 0.5)) {
        return { x: 0, y: 0 };
      }
      let x = current.x;
      let y = current.y;
      let vx = 0;
      let vy = 0;
      const stiffness = 0.22;
      const damping = 0.62;
      const step = () => {
        vx = (vx - x * stiffness) * damping;
        vy = (vy - y * stiffness) * damping;
        x += vx;
        y += vy;
        if (Math.abs(x) < 0.3 && Math.abs(y) < 0.3 && Math.abs(vx) < 0.3) {
          setStretch({ x: 0, y: 0 });
          return;
        }
        setStretch({ x, y });
        spring.current = requestAnimationFrame(step);
      };
      spring.current = requestAnimationFrame(step);
      return current;
    });
  }

  /* Pointer-follow tilt. The card leans toward the cursor, which is what
     makes it read as an object rather than an image — and it is off entirely
     for anyone who asked for less motion. */
  const onWrapMove = (e: PointerEvent<HTMLDivElement>) => {
    if (calm || e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * TILT_MAX * 2, y: px * TILT_MAX * 2 });
  };
  const onWrapLeave = () => setTilt({ x: 0, y: 0 });

  /* Dragging is the only way to frame a photo with a mouse, which would leave
     the crop unreachable from a keyboard. With a sticker selected the same
     keys move THAT instead, so nothing here needs a pointer. */
  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (selected) {
      const item = stickers.find((s) => s.key === selected);
      if (!item) return;
      const step = e.shiftKey ? STICKER_KEY_STEP / 4 : STICKER_KEY_STEP;
      const patch: Partial<PlacedSticker> = {};
      switch (e.key) {
        case "ArrowLeft":
          patch.x = item.x - step;
          break;
        case "ArrowRight":
          patch.x = item.x + step;
          break;
        case "ArrowUp":
          patch.y = item.y - step;
          break;
        case "ArrowDown":
          patch.y = item.y + step;
          break;
        case "+":
        case "=":
          patch.scale = item.scale + 0.1;
          break;
        case "-":
        case "_":
          patch.scale = item.scale - 0.1;
          break;
        case "[":
          patch.rotation = item.rotation - 0.09;
          break;
        case "]":
          patch.rotation = item.rotation + 0.09;
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          onStickersChange(stickers.filter((s) => s.key !== selected));
          onSelect(null);
          return;
        case "Escape":
          onSelect(null);
          return;
        default:
          return;
      }
      e.preventDefault();
      onStickersChange(
        stickers.map((s) => (s.key === selected ? { ...s, ...patch } : s)),
      );
      return;
    }

    const step = e.shiftKey ? KEY_PAN_STEP / 4 : KEY_PAN_STEP;
    let next: DpTransform | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = { ...transform, offsetX: transform.offsetX + step };
        break;
      case "ArrowRight":
        next = { ...transform, offsetX: transform.offsetX - step };
        break;
      case "ArrowUp":
        next = { ...transform, offsetY: transform.offsetY + step };
        break;
      case "ArrowDown":
        next = { ...transform, offsetY: transform.offsetY - step };
        break;
      case "+":
      case "=":
        next = { ...transform, scale: transform.scale + KEY_ZOOM_STEP };
        break;
      case "-":
      case "_":
        next = { ...transform, scale: transform.scale - KEY_ZOOM_STEP };
        break;
      default:
        return;
    }
    e.preventDefault();
    onTransformChange(clampTransform(photo, next, boxOf(canvas)));
  };

  const stretching = stretch.x !== 0 || stretch.y !== 0;

  return (
    <div
      ref={wrapRef}
      onPointerMove={onWrapMove}
      onPointerLeave={onWrapLeave}
      /* The perspective lives on the wrapper so the card rotates in it
         rather than being sheared flat. */
      style={{ perspective: "1400px" }}
    >
      <canvas
        ref={canvasRef}
        /* Only the fully-rounded card gets a rounded ELEMENT. "mixed" draws a
           square outer edge, and a rounded canvas element was clipping its own
           corners off — the card looked rounded no matter what was drawn. */
        className={`w-full touch-none ${corners === "rounded" ? "rounded-lg" : ""}`}
        style={{
          aspectRatio: ratio === "3:4" ? "3 / 4" : "1 / 1",
          transform: calm
            ? undefined
            : `rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg) translate3d(${stretch.x.toFixed(1)}px, ${stretch.y.toFixed(1)}px, 0) scale(${stretching ? 1.012 : 1})`,
          transition: calm
            ? undefined
            : stretching
              ? "none"
              : "transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        role="img"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        /* Tells the custom cursor this is grabbable — the ring opens over it
           exactly as it does over any other control (CustomCursor.tsx). */
        data-cursor="grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
