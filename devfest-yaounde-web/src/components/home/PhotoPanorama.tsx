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

/* --- How the panorama moves (px, px/s, ms) ------------------------------ */
/** The slow drift once the intro is over — unhurried, a look around. */
const AUTO_SPEED = 14;
/** Two full sweeps (end to end and back, twice), then it rests. */
const AUTO_TURNS = 4;
/** How quickly the drift eases in from a standstill, per second. */
const AUTO_EASE = 0.9;
/** The share of the range, at each end, over which the drift slows down. */
const EDGE_SOFTNESS = 0.18;
/** After the visitor pans, how long the photo waits before drifting again. */
const IDLE_RESUME = 6000;
/** How long after the hint shows the drift begins. */
const AUTO_DELAY = 1400;
/** Released-drag glide: the velocity falls by e every 1/FRICTION seconds. */
const FRICTION = 3.2;
/** Below this the glide stops. */
const MIN_GLIDE = 8;

/**
 * The thank-you photograph as a panorama (ADR 0098).
 *
 * A group photo is landscape and full of faces, so it is NEVER cropped. It
 * fills the hero's height at its own proportions; where that is wider than
 * the screen (every phone, most laptops) the visitor pans across it — swipe,
 * trackpad, shift-wheel, arrow keys, or drag with a mouse — and it starts
 * centred. It always COVERS the hero: where the photo at full height would
 * be narrower than the screen (very wide monitors), it widens to the full
 * width and the overflow is trimmed top and bottom instead.
 *
 * ## It moves like a panorama
 *
 * One animation loop owns the scroll position:
 *
 * - **The drift.** Once the intro is over the photo pans slowly from end to
 *   end on its own, easing in from a standstill and slowing into each edge
 *   before it turns, like a camera. After two full sweeps it glides back to
 *   the centre and rests for good. It holds while a hotspot is hovered,
 *   focused or open (a card never slides out from under the pointer), while
 *   the hero is off screen or the tab is hidden, and for a few idle seconds
 *   after the visitor pans themselves. Never under reduced motion.
 * - **The glide.** A mouse drag that is let go keeps travelling and slows to
 *   a stop. Touch, trackpads and the wheel scroll natively, with the
 *   browser's own momentum, and the loop simply takes the position they
 *   leave.
 *
 * The position is kept as a float, so a drift slower than a pixel a frame
 * still advances smoothly, and the loop's own writes are told apart from the
 * visitor's scrolling by comparing with the last value written.
 *
 * `children` are drawn ON the photo, in its own box — the hotspots — so a
 * percentage position stays on the same person whatever the screen.
 *
 * Once the thank-you note has gone (`hintAt`) a small hint says the photo
 * moves, and only if it actually does; it leaves at the visitor's first pan.
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
  const lastDragMoved = useRef(false);

  /* Everything the loop reads and writes, kept out of React state: it
     changes every frame. */
  const m = useRef({
    pos: 0,
    written: -1,
    glide: 0,
    auto: 0,
    dir: 1,
    turns: 0,
    done: false,
    resumeAt: 0,
    startAt: 0,
    range: 0,
    touched: false,
    visible: true,
    drag: null as null | {
      x: number;
      left: number;
      moved: boolean;
      samples: { t: number; x: number }[];
    },
  });

  const write = useCallback((el: HTMLDivElement, value: number) => {
    const s = m.current;
    s.pos = value;
    el.scrollLeft = value;
    s.written = el.scrollLeft;
  }, []);

  /* Measure after the image knows its size, and again on resize. */
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const extra = el.scrollWidth - el.clientWidth;
    setPannable(extra > 8);
    if (!centred.current && extra > 0) {
      write(el, extra / 2);
      centred.current = true;
    } else {
      m.current.pos = Math.min(Math.max(m.current.pos, 0), Math.max(extra, 0));
    }
  }, [write]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const img = el.querySelector("img");
    if (img) ro.observe(img);
    const io = new IntersectionObserver(([entry]) => {
      m.current.visible = entry.isIntersecting;
    });
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, [measure]);

  /* The loop. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = m.current;
      const range = el.scrollWidth - el.clientWidth;
      if (range <= 8 || s.drag) return;

      // The drift's clock starts when the preloader lets the page go — the
      // same moment every CSS timing on the hero counts from.
      if (!s.startAt) {
        if (document.querySelector('[data-preloader="held"]')) return;
        s.startAt = now + hintAt + AUTO_DELAY;
      }

      // The photo settles in from a slight zoom, which changes the range
      // under it; stay centred until the drift or the visitor moves it.
      if (range !== s.range) {
        s.range = range;
        if (!s.touched && now < s.startAt) write(el, range / 2);
      }

      if (Math.abs(s.glide) > MIN_GLIDE && !reduce.matches) {
        const next = s.pos + s.glide * dt;
        s.glide *= Math.exp(-FRICTION * dt);
        if (next <= 0 || next >= range) s.glide = 0;
        write(el, Math.min(Math.max(next, 0), range));
        return;
      }
      s.glide = 0;

      const held =
        s.done ||
        reduce.matches ||
        !s.visible ||
        document.hidden ||
        now < s.startAt ||
        now < s.resumeAt ||
        el.querySelector("li:hover, li:focus-within, li[data-open='true']");
      if (held) {
        s.auto = 0;
        return;
      }

      // Slow into each edge, turn, ease back out. After the last sweep it
      // heads for the centre instead and comes to rest there.
      const home = s.turns >= AUTO_TURNS;
      const edge = range * EDGE_SOFTNESS;
      const goal = home ? range / 2 : s.dir > 0 ? range : 0;
      if (home) s.dir = goal >= s.pos ? 1 : -1;
      const room = Math.abs(goal - s.pos);
      const soften = Math.max(home ? 0.08 : 0.12, Math.min(1, room / edge));
      const target = s.dir * AUTO_SPEED * soften;
      s.auto += (target - s.auto) * Math.min(1, AUTO_EASE * dt * 2);
      let next = s.pos + s.auto * dt;
      if (home && (room < 0.5 || Math.sign(goal - next) !== s.dir)) {
        s.done = true;
        s.auto = 0;
        next = goal;
      } else if (
        !home &&
        ((s.dir > 0 && next >= range - 0.5) || (s.dir < 0 && next <= 0.5))
      ) {
        // Count a turn only when the direction actually flips.
        s.dir = -s.dir;
        s.turns += 1;
      }
      write(el, Math.min(Math.max(next, 0), range));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hintAt, write]);

  /* The visitor took over: stop drifting for a while, drop any glide. */
  function takeOver() {
    const s = m.current;
    s.resumeAt = performance.now() + IDLE_RESUME;
    s.auto = 0;
    s.touched = true;
    if (centred.current) setPanned(true);
  }

  /* Mouse drag to pan, with a glide on release. Touch scrolls natively. */
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = scroller.current;
    if (!el) return;
    m.current.glide = 0;
    m.current.drag = {
      x: e.clientX,
      left: m.current.pos,
      moved: false,
      samples: [{ t: performance.now(), x: e.clientX }],
    };
    lastDragMoved.current = false;
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = m.current.drag;
    const el = scroller.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 4) {
      d.moved = true;
      takeOver();
    }
    const range = el.scrollWidth - el.clientWidth;
    write(el, Math.min(Math.max(d.left - dx, 0), range));
    const now = performance.now();
    d.samples.push({ t: now, x: e.clientX });
    while (d.samples.length > 2 && now - d.samples[0].t > 90) d.samples.shift();
  }
  function onPointerUp() {
    const d = m.current.drag;
    m.current.drag = null;
    lastDragMoved.current = d?.moved ?? false;
    if (!d?.moved) return;
    const first = d.samples[0];
    const lastSample = d.samples[d.samples.length - 1];
    const span = (lastSample.t - first.t) / 1000;
    // Released after holding still: no glide.
    if (span > 0 && performance.now() - lastSample.t < 60) {
      m.current.glide = -(lastSample.x - first.x) / span;
    }
    m.current.resumeAt = performance.now() + IDLE_RESUME;
  }

  const optimise = canOptimise(src, OPTIMISABLE_HOST) && !src.endsWith(".svg");

  return (
    <>
      <div
        ref={scroller}
        role="region"
        aria-label={label}
        tabIndex={0}
        data-cursor="grab"
        onScroll={() => {
          const el = scroller.current;
          if (!el) return;
          // Our own write, echoing back: not the visitor.
          if (Math.abs(el.scrollLeft - m.current.written) < 1.5) return;
          m.current.pos = el.scrollLeft;
          m.current.written = el.scrollLeft;
          if (!m.current.drag) {
            m.current.glide = 0;
            takeOver();
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onTouchStart={takeOver}
        onKeyDown={(e) => {
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
            takeOver();
          }
        }}
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
          <div className="ty-photo ty-pause relative h-full min-w-full shrink-0">
            {optimise ? (
              <Image
                src={src}
                alt={alt}
                width={3000}
                height={2000}
                priority
                quality={92}
                draggable={false}
                sizes="(min-aspect-ratio: 183/100) 100vw, 183vh"
                className="h-full w-auto min-w-full max-w-none object-cover"
                onLoad={measure}
              />
            ) : (
              <img
                src={src}
                alt={alt}
                draggable={false}
                className="h-full w-auto min-w-full max-w-none object-cover"
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
