"use client";

import { useId, useState, type CSSProperties } from "react";
import { FactSticker } from "@/components/home/FactSticker";

export interface HeroFact {
  id: string;
  /** Where the hotspot sits on the photograph, in % of the photo. */
  x: number;
  y: number;
  /** A DP-generator sticker id that says what the card is about. */
  sticker: string;
  value: string;
  label: string;
  detail?: string;
}

/** Each card's own lean, so no two tilt alike — not a rule of left or right. */
const TILTS = [-2.2, 1.4, -0.9, 2.6, -1.6, 0.8, -2.8, 1.9];

/**
 * The hotspots on the thank-you photograph (ADR 0098).
 *
 * As the thank-you note breaks apart, a handful of its particles fly out
 * from the centre and settle on the photo as pinging dots — a "room tour"
 * hotspot. Hover (or focus, or tap) one and the DOT ITSELF becomes the card.
 *
 * ## One element, not two
 *
 * Closed, the card is clipped to a dot-sized circle in one of its corners,
 * and that corner holds the dot's face (white disc, black ring, yellow pip).
 * So what looks like a dot IS the card. Opening interpolates the clip from
 * that circle to the whole rounded card (two `inset()` shapes, so it is a
 * true stretch, not a fade) while the dot's face melts away; closing plays it
 * backwards and the face returns as the card folds home. Nothing else is
 * drawn on top, so there is no seam to see.
 *
 * Each dot is a real `<button>` over the face: keyboard reachable, with
 * `aria-expanded`, and the card describes it. Hover and focus open it from
 * CSS; a tap toggles it for touch screens.
 *
 * Positions are percentages of the photo, so a new photo means editing
 * `src/data/hero-facts.json`, not this file. Place every dot OFF faces —
 * on a banner, a wall, a laptop — and check it at the dot's real size
 * (about 3.5% of the photo's height), pulse ring included.
 */
export function HeroFacts({
  facts,
  settleAt,
}: {
  facts: HeroFact[];
  settleAt: number;
}) {
  return (
    <ul className="pointer-events-none absolute inset-0 z-15">
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
  const far = "calc(100% - var(--d))";
  const closedClip = [
    upward ? far : "0",
    toLeft ? "0" : far,
    upward ? "0" : far,
    toLeft ? far : "0",
  ].join(" ");
  const corner = `${upward ? "bottom" : "top"} ${toLeft ? "right" : "left"}`;

  return (
    <li
      data-open={open}
      className="group absolute -translate-x-1/2 -translate-y-1/2 [--d:1.75rem] sm:[--d:2rem]"
      style={
        {
          left: `${fact.x}%`,
          top: `${fact.y}%`,
          "--fx": `${(50 - fact.x).toFixed(1)}vw`,
          "--fy": `${(50 - fact.y).toFixed(1)}svh`,
          "--settle": `${delay}ms`,
          "--ping": `${delay + 900}ms`,
        } as CSSProperties
      }
    >
      <span className="ty-settle ty-pause pointer-events-auto relative block size-(--d)">
        <span
          aria-hidden
          className="ty-ping absolute inset-0 rounded-pill border-2 border-offwhite"
        />

        {/* The card — which, closed, is the dot. */}
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
          className={`ty-fact-card absolute z-20 block w-64 rounded-xl border-2 border-black02 bg-offwhite px-4 text-left text-black02 sm:w-72 ${
            toLeft ? "right-0" : "left-0"
          } ${upward ? "bottom-0 pb-[calc(var(--d)+0.5rem)] pt-4" : "top-0 pb-4 pt-[calc(var(--d)+0.5rem)]"}`}
        >
          {/* The dot's face, in the corner the card grows from. Offset by
              the border so it sits exactly on the card's own corner. */}
          <span
            aria-hidden
            className={`ty-card-dot absolute grid size-(--d) place-items-center rounded-pill border-2 border-black02 bg-offwhite ${
              toLeft ? "-right-0.5" : "-left-0.5"
            } ${upward ? "-bottom-0.5" : "-top-0.5"}`}
          >
            <span className="ty-card-pip size-2.5 rounded-pill bg-primary sm:size-3" />
          </span>

          {/* The accent: a sticker that says what the card is about, slapped
              on the far corner. */}
          <FactSticker
            id={fact.sticker}
            size={56}
            className={`ty-card-sticker absolute top-2 ${toLeft ? "left-2 rotate-[-10deg]" : "right-2 rotate-[8deg]"}`}
          />

          <span
            className={`block font-sans text-display-l font-bold leading-none tracking-[-0.045em] ${toLeft ? "pl-14" : "pr-14"}`}
          >
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

        <button
          type="button"
          aria-expanded={open}
          aria-describedby={cardId}
          aria-label={`${fact.value} ${fact.label}`}
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setOpen(false)}
          className="absolute inset-0 z-30 rounded-pill focus-visible:outline-none"
        />
      </span>
    </li>
  );
}
