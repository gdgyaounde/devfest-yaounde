"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * Storytime's intro companions (ADR 0087): four cursors in the brand colours,
 * each named after a role in the community, drifting around the words as the
 * story is told — as if the people who lived it were writing it together.
 *
 * Each cursor keeps to its own band of the screen (left/right AND a
 * different height), so they never pile up, even on a phone.
 * Positions are a fixed set of waypoints per cursor (percent of the screen),
 * stepped on a slow beat, so nothing is random between server and client and
 * the drift never jumps. Decorative only (`aria-hidden`); not rendered at all
 * under reduced motion.
 */
const CURSORS = [
  {
    role: "speaker",
    colour: "#4285F4",
    path: [
      [18, 22],
      [28, 28],
      [22, 32],
      [14, 26],
      [32, 20],
    ],
  },
  {
    role: "volunteer",
    colour: "#34A853",
    path: [
      [72, 58],
      [80, 64],
      [64, 62],
      [76, 54],
      [68, 66],
    ],
  },
  {
    role: "attendee",
    colour: "#EA4335",
    path: [
      [70, 36],
      [80, 42],
      [66, 40],
      [76, 46],
      [84, 38],
    ],
  },
  {
    role: "organiser",
    colour: "#F9AB00",
    path: [
      [20, 72],
      [30, 80],
      [14, 84],
      [26, 70],
      [34, 78],
    ],
  },
] as const;

const BEAT_MS = 1700;
/** The same path as the site cursor in `CustomCursor` (tip at about 9, 5.5). */
const ARROW =
  "M 9 5.5 L 25.6 12.6 L 19.83 14.34 Q 16.3 15.4 14.36 18.55 L 11.2 23.7 Z";

export function IntroCursors({ visible }: { visible: boolean }) {
  const tr = useTranslations("testimonial.roles");
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setBeat((b) => b + 1), BEAT_MS);
    return () => window.clearInterval(id);
  }, [visible]);

  return (
    <div
      aria-hidden
      className="intro-cursors pointer-events-none absolute inset-0 z-[25] overflow-hidden transition-opacity duration-1000"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {CURSORS.map((c, i) => {
        // Each cursor is a beat out of step with the next, so they never
        // all move at once.
        const [x, y] = c.path[(beat + i) % c.path.length];
        return (
          <div
            key={c.role}
            className="absolute left-0 top-0 w-[30px]"
            style={{
              transform: `translate(${x}vw, ${y}svh)`,
              transition: `transform ${BEAT_MS + 300}ms cubic-bezier(0.65, 0, 0.35, 1)`,
              transitionDelay: `${i * 180}ms`,
            }}
          >
            {/* The site's own cursor (CustomCursor's tail-less rounded
                arrow) — the arrow alone, no pinned dot or follower — in the
                role's colour. The ink layer underneath keeps
                the yellow one visible on the pastel page. */}
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
                fill={c.colour}
                stroke={c.colour}
                strokeWidth="8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            {/* Cursors on the right half carry their name on the LEFT, so
                it never runs off the edge of a phone. */}
            <span
              className={`absolute top-6 whitespace-nowrap rounded-pill border-2 border-black02 px-2.5 py-0.5 font-mono text-mono-tag font-bold text-black02 ${
                c.path[0][0] > 50 ? "right-3" : "left-6"
              }`}
              style={{ backgroundColor: c.colour }}
            >
              {tr(c.role)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
