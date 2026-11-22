"use client";

/* eslint-disable @next/next/no-img-element -- the unoptimisable-host branch */
import Image from "next/image";
import { ArrowsHorizontal } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { canOptimise, OPTIMISABLE_HOST } from "@/lib/images";

/**
 * The thank-you photograph as a panorama (ADR 0098).
 *
 * A group photo is landscape and full of faces, so it is NEVER cropped. It
 * fills the hero's height at its own proportions; where that is wider than
 * the screen (every phone, most laptops) the visitor pans across it — swipe,
 * trackpad, shift-wheel, arrow keys, or drag with a mouse — and it starts
 * centred. Where it is narrower (very wide screens) it sits centred on a
 * blurred copy of itself, so there is no bare band either side.
 *
 * `children` are drawn ON the photo, in its own box — the hotspots — so a
 * percentage position stays on the same person whatever the screen.
 *
 * Once the thank-you note has gone (`hintAt`) a small hint says the photo
 * moves, and only if it actually does; it leaves at the first pan.
 */
export function PhotoPanorama({
  src,
  alt,
  hintAt,
  hint,
  label,
  children,
}: {
  src: string;
  alt: string;
  hintAt: number;
  hint: string;
  label: string;
  children?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [pannable, setPannable] = useState(false);
  const [panned, setPanned] = useState(false);
  const centred = useRef(false);
  /* Our own centring scrolls the box too; that is not the visitor panning. */
  const ignoreScrollUntil = useRef(0);
  const lastDragMoved = useRef(false);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  /* Measure after the image knows its size, and again on resize. */
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const extra = el.scrollWidth - el.clientWidth;
    setPannable(extra > 8);
    if (!centred.current && extra > 0) {
      ignoreScrollUntil.current = performance.now() + 500;
      el.scrollLeft = extra / 2;
      centred.current = true;
    }
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const img = el.querySelector("img");
    if (img) ro.observe(img);
    return () => ro.disconnect();
  }, [measure]);

  /* Mouse drag to pan. Touch and trackpads scroll natively. */
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = scroller.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
    lastDragMoved.current = false;
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = scroller.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.left - dx;
  }
  function onPointerUp() {
    lastDragMoved.current = drag.current?.moved ?? false;
    drag.current = null;
  }

  const optimise = canOptimise(src, OPTIMISABLE_HOST) && !src.endsWith(".svg");

  return (
    <>
      {/* The ambient copy: only ever seen beside a photo narrower than the
          screen. A small file, blurred — not a second full download. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        {optimise ? (
          <Image
            src={src}
            alt=""
            fill
            sizes="12vw"
            className="scale-110 object-cover blur-2xl"
          />
        ) : (
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
          />
        )}
        <div className="absolute inset-0 bg-black02/30" />
      </div>

      <div
        ref={scroller}
        role="region"
        aria-label={label}
        tabIndex={0}
        data-cursor="grab"
        onScroll={() => {
          if (
            !panned &&
            centred.current &&
            performance.now() > ignoreScrollUntil.current
          ) {
            setPanned(true);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClickCapture={(e) => {
          // A drag that ends on a hotspot is a pan, not a click.
          if (lastDragMoved.current) {
            e.stopPropagation();
            lastDragMoved.current = false;
          }
        }}
        className="ty-pan absolute inset-0 select-none overflow-x-auto overflow-y-hidden overscroll-x-contain focus-visible:outline-none"
      >
        <div className="flex h-full min-w-full justify-center">
          <div className="ty-photo ty-pause relative h-full shrink-0">
            {optimise ? (
              <Image
                src={src}
                alt={alt}
                width={3000}
                height={2000}
                priority
                draggable={false}
                sizes="(min-aspect-ratio: 3/2) 100vw, 150vh"
                className="h-full w-auto max-w-none"
                onLoad={measure}
              />
            ) : (
              <img
                src={src}
                alt={alt}
                draggable={false}
                className="h-full w-auto max-w-none"
                onLoad={measure}
              />
            )}
            {children}
          </div>
        </div>
      </div>

      {pannable && (
        <p
          aria-hidden
          data-gone={panned}
          className="ty-hint pointer-events-none absolute inset-x-0 z-20 flex justify-center"
          style={{ "--hint-at": `${hintAt}ms` } as CSSProperties}
        >
          <span className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-4 py-2 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02 shadow-[0_3px_0_0_var(--color-black02)]">
            <ArrowsHorizontal
              size={18}
              weight="bold"
              aria-hidden
              className="ty-hint-nudge"
            />
            {hint}
          </span>
        </p>
      )}
    </>
  );
}
