"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

/**
 * Storytime's intro companions (ADR 0087): four cursors in the brand colours,
 * one per role, telling the story of how an edition comes together.
 *
 *   - They JOIN one at a time — the organiser first, then a volunteer, then a
 *     speaker, then an attendee — each flying in from outside the screen,
 *     from its own side or corner.
 *   - While the story is told they each do their own thing: the organiser
 *     circles the whole scene, the volunteer runs figure-eights, the speaker
 *     paces the top of the stage, the attendee wanders.
 *   - As the story closes they LEAVE in reverse order, off the screen again,
 *     and the organiser is the last one out.
 *
 * Driven frame by frame on the elements (no React state per frame). Paths
 * are smooth functions of time, so nothing jumps. Decorative only
 * (`aria-hidden`); never rendered under reduced motion.
 */

type Point = { x: number; y: number }; // percent of the viewport

interface Actor {
  role: "organiser" | "volunteer" | "speaker" | "attendee";
  colour: string;
  /** Where it flies in from, and out to — always off-screen. */
  from: Point;
  to: Point;
  /** What it does on stage, t in seconds since it arrived. */
  move: (t: number) => Point;
}

const ACTORS: Actor[] = [
  {
    // Circles the whole scene, keeping an eye on everything.
    role: "organiser",
    colour: "#F9AB00",
    from: { x: -12, y: 112 },
    to: { x: -14, y: 108 },
    move: (t) => ({
      x: 50 + 34 * Math.cos(0.42 * t + 2.4),
      y: 52 + 30 * Math.sin(0.42 * t + 2.4),
    }),
  },
  {
    // Runs figure-eights — everywhere at once.
    role: "volunteer",
    colour: "#34A853",
    from: { x: 114, y: 62 },
    to: { x: 112, y: 40 },
    move: (t) => ({
      x: 50 + 36 * Math.sin(0.55 * t + 1.2),
      y: 58 + 18 * Math.sin(1.1 * t + 2.4),
    }),
  },
  {
    // Paces the top of the stage, like a talk in progress.
    role: "speaker",
    colour: "#4285F4",
    from: { x: 30, y: -14 },
    to: { x: 70, y: -14 },
    move: (t) => ({
      x: 50 + 34 * Math.sin(0.38 * t),
      y: 24 + 6 * Math.sin(1.3 * t),
    }),
  },
  {
    // Wanders, curious, a bit of everything.
    role: "attendee",
    colour: "#EA4335",
    from: { x: 112, y: -12 },
    to: { x: 112, y: 112 },
    move: (t) => ({
      x: 56 + 26 * Math.sin(0.47 * t + 0.6) + 8 * Math.sin(1.3 * t),
      y: 46 + 22 * Math.cos(0.36 * t + 0.4) + 7 * Math.sin(1.7 * t),
    }),
  },
];

/** Flight in / out, in ms. */
const ENTER_MS = 1800;
const EXIT_MS = 1500;

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeIn = (x: number) => x * x * x;
const mix = (a: Point, b: Point, k: number): Point => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
});

/** The site cursor's path (CustomCursor), tip at about (9, 5.5). */
const ARROW =
  "M 9 5.5 L 25.6 12.6 L 19.83 14.34 Q 16.3 15.4 14.36 18.55 L 11.2 23.7 Z";

export function IntroCursors({
  visible,
  enterAt,
  exitAt,
}: {
  /** False once the intro is over (or skipped): everything stops. */
  visible: boolean;
  /** When each actor joins, ms from landing, in ACTORS order. */
  enterAt: readonly number[];
  /** When each actor leaves, ms from landing, in ACTORS order. */
  exitAt: readonly number[];
}) {
  const tr = useTranslations("testimonial.roles");
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!visible) return;
    const start = performance.now();
    const sides: ("left" | "right")[] = ACTORS.map(() => "right");
    let frame = 0;

    const tick = (now: number) => {
      const ms = now - start;
      ACTORS.forEach((actor, i) => {
        const el = refs.current[i];
        if (!el) return;
        const enter = enterAt[i] ?? 0;
        const exit = exitAt[i] ?? Number.POSITIVE_INFINITY;
        let p: Point;
        if (ms < enter) {
          p = actor.from;
        } else {
          const onStage = actor.move((ms - enter) / 1000);
          if (ms < enter + ENTER_MS) {
            p = mix(actor.from, onStage, easeOut((ms - enter) / ENTER_MS));
          } else if (ms < exit) {
            p = onStage;
          } else {
            p = mix(
              onStage,
              actor.to,
              easeIn(Math.min(1, (ms - exit) / EXIT_MS)),
            );
          }
        }
        el.style.transform = `translate(${p.x}vw, ${p.y}svh)`;
        // Name on the side with room: right of the arrow on the left half
        // of the screen, left of it on the right half.
        const side = p.x > 55 ? "left" : "right";
        const label = labels.current[i];
        if (label && side !== sides[i]) {
          sides[i] = side;
          label.style.transform =
            side === "left"
              ? "translateX(calc(-100% + 6px))"
              : "translateX(22px)";
        }
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, enterAt, exitAt]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[25] overflow-hidden transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {ACTORS.map((actor, i) => (
        <div
          key={actor.role}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="absolute left-0 top-0 w-[30px] will-change-transform"
          style={{
            transform: `translate(${actor.from.x}vw, ${actor.from.y}svh)`,
          }}
        >
          {/* The site's own cursor (CustomCursor's tail-less rounded
              arrow) — the arrow alone, no pinned dot or follower — in the
              role's colour, with an ink edge so yellow reads on pastel. */}
          <svg
            width="30"
            height="30"
            viewBox="0 0 28 28"
            className="overflow-visible"
          >
            <path
              d={ARROW}
              fill="#1E1E1E"
              stroke="#1E1E1E"
              strokeWidth="11"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={ARROW}
              fill={actor.colour}
              stroke={actor.colour}
              strokeWidth="8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          <span
            ref={(el) => {
              labels.current[i] = el;
            }}
            className="absolute left-0 top-6 whitespace-nowrap rounded-pill border-2 border-black02 px-2.5 py-0.5 font-mono text-mono-tag font-bold text-black02 transition-transform duration-500 ease-in-out"
            style={{
              backgroundColor: actor.colour,
              transform: "translateX(22px)",
            }}
          >
            {tr(actor.role)}
          </span>
        </div>
      ))}
    </div>
  );
}
