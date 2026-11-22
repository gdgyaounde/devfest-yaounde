import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { PhotoPanorama } from "@/components/home/PhotoPanorama";
import { HeroFacts } from "@/components/home/HeroFacts";
import heroFacts from "@/data/hero-facts.json";

/**
 * The landing hero for the days after the edition (ADR 0098): a thank-you.
 *
 * ## The composition
 *
 * The group photograph IS the hero — the people in it are the message. The
 * only thing that stays on it is the edition's watermark, centred along the
 * bottom edge at its own proportions.
 *
 * ## The arrival (about five seconds, once the preloader lifts)
 *
 * 1. The photograph settles in.
 * 2. "Thank you, Yaoundé." is typed in at the centre — big, bold, stroked,
 *    tilted — each letter popping in on the bouncy curve.
 * 3. A flat backdrop draws itself behind each line.
 * 4. A gentle pinch, and a burst of brand confetti around it.
 * 5. Then it zooms out and breaks apart: the letters
 *    scatter and fade, a spray of small flat particles goes with them —
 *    and a few of those settle on the photo as hotspots (`HeroFacts`).
 * 6. The watermark rises at the bottom, and the photo is left on its own.
 *
 * Pure CSS, every timing a custom property computed here — no client JS. The
 * scatter directions are pseudo-random but SEEDED, so the server and every
 * visitor draw the same burst (no hydration mismatch, nothing on a timer).
 * Held while the preloader owns the screen, like every hero entrance.
 *
 * ## Accessibility
 *
 * The animated words are decorative (`aria-hidden`); the real heading is a
 * visually-hidden `<h1>` with the same words, so assistive tech reads it once
 * and never meets the letters flying off. Under reduced motion the words are
 * simply shown, drawn, and stay.
 *
 * ## No navbar here
 *
 * `GlobalChrome` keeps the navbar and the banner out of sight on the home
 * page until the visitor scrolls past this section, then slides them in.
 *
 * ## The photograph and the watermark
 *
 * `PHOTO`, this edition's group photo, shipped in `public/thank-you/`. `/brand/watermark-devfest.svg` is used as
 * supplied — never stretched to the full width. Its yellow follows the
 * footer's theme through recoloured copies (`watermark-devfest-<theme>.svg`,
 * only the five `#FBBC04` fills changed); see `.ty-watermark-art`.
 */

/* --- The timeline, in ms after the preloader lifts ----------------------- */
const TYPE_START = 900;
const TYPE_STEP = 65;
const POP = 450;
const DRAW = 600;
const PINCH_GAP = 250;
const PINCH_TO_BREAK = 1500;
const BREAK = 1100;

/** This edition's group photo, shipped with the site (ADR 0098). */
const PHOTO = "/thank-you/devfest-yaounde-2026-group.jpg";

/** Brand confetti: the four Google colours, flat. */
const CONFETTI = [
  "bg-primary",
  "bg-blue-halftone",
  "bg-red-halftone",
  "bg-green-halftone",
  "bg-offwhite",
];

/** A tiny seeded generator: the same burst on the server and the client. */
function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const vars = (v: Record<string, string>) => v as CSSProperties;

/** Figures the site already knows, so a card can never disagree with it. */
type LiveCounts = { speakers: number };

export async function ThankYouHero({
  locale,
  counts,
}: {
  locale: string;
  counts: LiveCounts;
}) {
  const lang = locale === "en" ? "en" : "fr";
  const t = await getTranslations("home.thanks");
  const lines = [t("lead"), t("city")].map((line) => Array.from(line));
  const total = lines[0].length + lines[1].length;

  const typedAt = TYPE_START + total * TYPE_STEP + POP;
  const drawAt = [typedAt - 200, typedAt - 20];
  // Fully drawn → a gentle pinch with a burst of brand confetti → it breaks.
  const pinchAt = drawAt[1] + DRAW + PINCH_GAP;
  const breakAt = pinchAt + PINCH_TO_BREAK;
  const watermarkAt = breakAt + BREAK - 500;

  const rand = seeded(2026);
  let index = 0;

  const confetti = Array.from({ length: 30 }, (_, i) => {
    const angle = (i / 30) * Math.PI * 2 + rand() * 0.35;
    const dist = 24 + rand() * 22;
    return {
      x: `${(Math.cos(angle) * dist).toFixed(1)}vmin`,
      y: `${(Math.sin(angle) * dist * 0.8).toFixed(1)}vmin`,
      r: `${Math.round(rand() * 540 - 270)}deg`,
      delay: `${Math.round(pinchAt + 160 + rand() * 120)}ms`,
      w: rand() > 0.5 ? "0.5rem" : "0.75rem",
      h: rand() > 0.4 ? "1.1rem" : "0.6rem",
      round: rand() > 0.65,
      tone: CONFETTI[i % CONFETTI.length],
    };
  });

  const particles = Array.from({ length: 36 }, () => {
    const angle = rand() * Math.PI * 2;
    const dist = 18 + rand() * 32;
    return {
      x: `${(Math.cos(angle) * dist).toFixed(1)}vw`,
      y: `${(Math.sin(angle) * dist * 0.75).toFixed(1)}vh`,
      start: `${(rand() * 8 - 4).toFixed(1)}vw`,
      size: `${(0.5 + rand() * 0.7).toFixed(2)}rem`,
      delay: `${Math.round(breakAt + rand() * 260)}ms`,
      round: rand() > 0.5,
      tone:
        rand() > 0.55
          ? "bg-primary"
          : rand() > 0.5
            ? "bg-offwhite"
            : "bg-black02",
    };
  });

  return (
    <section
      id="thank-you"
      className="relative isolate flex min-h-svh flex-col justify-end overflow-hidden bg-pastel"
    >
      <h1 className="sr-only">{`${t("lead")} ${t("city")}`}</h1>

      {/* ---------- The photograph, as a panorama, with its hotspots ---------- */}
      <div className="absolute inset-0 -z-10 bg-pastel">
        <PhotoPanorama
          src={PHOTO}
          alt={t("photoAlt")}
          hintAt={watermarkAt + 700}
          hint={t("panHint")}
          label={t("panLabel")}
        >
          <HeroFacts
            settleAt={breakAt}
            facts={heroFacts.map((f) => ({
              id: f.id,
              x: f.x,
              y: f.y,
              sticker: f.sticker,
              // A fact with `count` shows the live figure instead of `value`.
              value:
                "count" in f && f.count
                  ? String(counts[f.count as keyof LiveCounts])
                  : f.value,
              label: f.label[lang],
              detail: f.detail?.[lang],
            }))}
          />
        </PhotoPanorama>
      </div>

      {/* ---------- The intro: typed, drawn, then broken apart ---------- */}
      <div
        aria-hidden
        className="ty-intro pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4"
      >
        <div
          className="ty-zoom flex flex-col items-center font-sans text-[clamp(3rem,13vw,10rem)] font-bold leading-[0.95] tracking-[-0.055em]"
          style={vars({ "--ty-break": `${breakAt}ms` })}
        >
          {/* The pinch: its own element, so its squeeze never fights the
              zoom-out or a line's tilt. */}
          <div
            className="ty-pinch flex flex-col items-center"
            style={vars({ "--ty-pinch": `${pinchAt}ms` })}
          >
            {lines.map((chars, line) => (
              <span
                key={line}
                className={`relative inline-block px-[0.24em] py-[0.08em] ${
                  line === 0
                    ? "-rotate-[1.5deg]"
                    : /* Tucked up under the first line, so the two
                       backdrops overlap a little. */
                      "-mt-[0.16em] ml-[0.8em] rotate-[1deg]"
                }`}
              >
                <span
                  className={`ty-draw absolute inset-0 -z-10 border-[0.05em] border-black02 shadow-[0_0.07em_0_0_var(--color-black02)] ${
                    line === 0 ? "bg-primary" : "bg-black02"
                  }`}
                  style={vars({
                    "--ty-draw": `${drawAt[line]}ms`,
                    "--ty-plate-r": line === 0 ? "-9deg" : "7deg",
                  })}
                />
                {chars.map((ch, i) => {
                  const at = TYPE_START + index++ * TYPE_STEP;
                  const angle = rand() * Math.PI * 2;
                  return (
                    <span
                      key={i}
                      className="ty-char"
                      style={vars({ "--ty-type": `${at}ms` })}
                    >
                      <span
                        className="ty-shard"
                        style={vars({
                          "--ty-x": `${(Math.cos(angle) * (0.6 + rand())).toFixed(2)}em`,
                          "--ty-y": `${(Math.sin(angle) * (0.6 + rand()) - 0.4).toFixed(2)}em`,
                          "--ty-r": `${Math.round(rand() * 160 - 80)}deg`,
                          "--ty-shatter": `${Math.round(breakAt + rand() * 280)}ms`,
                        })}
                      >
                        {ch === " " ? " " : ch}
                      </span>
                    </span>
                  );
                })}
              </span>
            ))}
          </div>
        </div>

        {/* The brand confetti, bursting around the note at the pinch. */}
        {confetti.map((c, i) => (
          <span
            key={`c${i}`}
            className={`ty-confetti absolute left-1/2 top-1/2 ${c.tone} ${c.round ? "rounded-pill" : "rounded-[2px]"}`}
            style={vars({
              width: c.w,
              height: c.round ? c.w : c.h,
              "--c-x": c.x,
              "--c-y": c.y,
              "--c-r": c.r,
              "--c-delay": c.delay,
            })}
          />
        ))}

        {particles.map((p, i) => (
          <span
            key={i}
            className={`ty-particle absolute left-1/2 top-1/2 border-2 border-black02 ${p.tone} ${
              p.round ? "rounded-pill" : "rounded-sm"
            }`}
            style={vars({
              width: p.size,
              height: p.size,
              "--p-x": p.x,
              "--p-y": p.y,
              "--p-start": p.start,
              "--p-delay": p.delay,
            })}
          />
        ))}
      </div>

      {/* ---------- What stays: the watermark, centred along the bottom ---------- */}
      <div className="pointer-events-none relative z-20 flex justify-center px-5 pb-6 sm:px-8 sm:pb-10">
        {/* A background, not an <img>, so it can follow the footer's theme:
            `.ty-watermark-art` picks the copy whose yellow is recoloured to
            the active theme, and only that one is downloaded. */}
        <div
          aria-hidden
          className="ty-watermark ty-watermark-art ty-pause pointer-events-none aspect-[1330/189] w-[min(100%,42rem)] select-none"
          style={{ animationDelay: `${watermarkAt}ms` }}
        />
      </div>
    </section>
  );
}
