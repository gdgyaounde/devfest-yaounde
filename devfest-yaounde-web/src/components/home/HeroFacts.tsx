"use client";

import { useId, useState, type CSSProperties } from "react";

export interface HeroFact {
  id: string;
  /** Where the hotspot sits on the photograph, in % of the hero box. */
  x: number;
  y: number;
  value: string;
  label: string;
  detail?: string;
}

/**
 * The hotspots on the thank-you photograph (ADR 0098).
 *
 * As the thank-you note breaks apart, a handful of its particles fly out
 * from the centre and settle on the photo as pinging dots — a "room tour"
 * hotspot. Hover (or focus, or tap) one and it opens a small card with a fact
 * about the day. The card grows out of the dot and folds back into it
 * (`.ty-fact-card` in motion.css), tilted a touch with an accent strip.
 *
 * Each dot is a real `<button>`: keyboard reachable, `aria-expanded`, and the
 * card is described by it. Hover and focus open it from CSS; a tap toggles it
 * for touch screens, where there is no hover.
 *
 * The flight is CSS (`ty-settle`): from the centre of the hero to the dot's
 * place, starting as the words break (`settleAt`), each a little after the
 * last. The ping starts once it has landed. Positions are percentages, so a
 * new photo means editing `src/data/hero-facts.json`, not this file.
 */
/** Each card's own lean, so no two tilt alike — not a rule of left or right. */
const TILTS = [-2.2, 1.4, -0.9, 2.6, -1.6, 0.8, -2.8, 1.9];

export function HeroFacts({
  facts,
  settleAt,
}: {
  facts: HeroFact[];
  settleAt: number;
}) {
  return (
    <ul className="pointer-events-none absolute inset-0 z-[15]">
      {facts.map((fact, i) => (
        <Hotspot
          key={fact.id}
          fact={fact}
          tilt={TILTS[i % TILTS.length]}
          delay={settleAt + 150 + i * 110}
        />
      ))}
    </ul>
  );
}

function Hotspot({
  fact,
  delay,
  tilt,
}: {
  fact: HeroFact;
  delay: number;
  tilt: number;
}) {
  const [open, setOpen] = useState(false);
  const cardId = useId();
  // Cards open towards the middle of the photo, so they never run off it:
  // sideways away from the nearer edge, and upwards from a low dot.
  const toLeft = fact.x > 55;
  const upward = fact.y > 55;
  /*
   * The card grows out of the CORNER the dot sits in. Closed, it is clipped
   * to a dot-sized circle in that corner (an `inset()` whose rounding is half
   * the dot); open, the inset is zero with the card's own radius. Two inset()
   * shapes interpolate cleanly, so the circle stretches into the rounded card
   * and folds back into it.
   */
  const far = "calc(100% - var(--d))";
  const closedClip = [
    upward ? far : "0",
    toLeft ? "0" : far,
    upward ? "0" : far,
    toLeft ? far : "0",
  ].join(" ");
  const corner = `${upward ? "bottom" : "top"} ${toLeft ? "right" : "left"}`;
  const style = {
    left: `${fact.x}%`,
    top: `${fact.y}%`,
    "--fx": `${(50 - fact.x).toFixed(1)}vw`,
    "--fy": `${(50 - fact.y).toFixed(1)}svh`,
    "--settle": `${delay}ms`,
    "--ping": `${delay + 900}ms`,
  } as CSSProperties;

  return (
    <li
      data-open={open}
      className="group absolute -translate-x-1/2 -translate-y-1/2 [--d:1.75rem] sm:[--d:2rem]"
      style={style}
    >
      <span className="ty-settle ty-pause pointer-events-auto relative block">
        <span
          aria-hidden
          className="ty-ping absolute inset-0 rounded-pill border-2 border-offwhite"
        />
        <button
          type="button"
          aria-expanded={open}
          aria-describedby={cardId}
          aria-label={`${fact.value} ${fact.label}`}
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setOpen(false)}
          className="ty-dot relative z-30 grid size-(--d) place-items-center rounded-pill border-2 border-black02 bg-offwhite shadow-[0_3px_0_0_var(--color-black02)]"
        >
          <span
            aria-hidden
            className="size-2.5 rounded-pill bg-primary sm:size-3"
          />
        </button>

        <span
          id={cardId}
          role="tooltip"
          data-open={open}
          style={
            {
              "--clip-closed": `inset(${closedClip} round calc(var(--d) / 2))`,
              "--corner": corner,
              "--tilt": `${tilt}deg`,
            } as CSSProperties
          }
          className={`ty-fact-card absolute z-20 w-60 rounded-xl border-2 border-b-[6px] border-black02 bg-offwhite px-4 text-left text-black02 sm:w-68 ${
            toLeft ? "right-0" : "left-0"
          } ${upward ? "bottom-0 pb-[calc(var(--d)+0.75rem)] pt-4" : "top-0 pb-4 pt-[calc(var(--d)+0.75rem)]"}`}
        >
          {/* The accent: the figure itself, on a flat tag of the theme
              colour. */}
          <span className="inline-block rounded-md border-2 border-black02 bg-primary px-2 py-0.5 font-sans text-heading-l font-bold leading-none tracking-[-0.04em]">
            {fact.value}
          </span>
          <span className="mt-2 block font-mono text-mono-tag font-bold uppercase tracking-wide">
            {fact.label}
          </span>
          {fact.detail && (
            <span className="mt-1.5 block text-caption text-black02/75">
              {fact.detail}
            </span>
          )}
        </span>
      </span>
    </li>
  );
}
