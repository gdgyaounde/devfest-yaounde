import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { ContentImage } from "@/components/ui/ContentImage";

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
 * 4. It holds for a breath, then zooms out and breaks apart: the letters
 *    scatter and fade, a spray of small flat particles goes with them.
 * 5. The watermark rises at the bottom, and the photo is left on its own.
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
 * `backdropUrl` is the dashboard's hero image, so the group photo can be
 * swapped without a deploy. `/brand/watermark-devfest.svg` is used exactly as
 * supplied — never edited, never stretched to the full width.
 */

/* --- The timeline, in ms after the preloader lifts ----------------------- */
const TYPE_START = 900;
const TYPE_STEP = 65;
const POP = 450;
const DRAW = 600;
const HOLD = 1100;
const BREAK = 1100;

/** A tiny seeded generator: the same burst on the server and the client. */
function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const vars = (v: Record<string, string>) => v as CSSProperties;

export async function ThankYouHero({ backdropUrl }: { backdropUrl: string }) {
  const t = await getTranslations("home.thanks");
  const hasPhoto = Boolean(backdropUrl?.trim());
  const lines = [t("lead"), t("city")].map((line) => Array.from(line));
  const total = lines[0].length + lines[1].length;

  const typedAt = TYPE_START + total * TYPE_STEP + POP;
  const drawAt = [typedAt - 200, typedAt - 20];
  const breakAt = drawAt[1] + DRAW + HOLD;
  const watermarkAt = breakAt + BREAK - 500;

  const rand = seeded(2026);
  let index = 0;

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

      <div aria-hidden className="absolute inset-0 -z-10 bg-pastel">
        {hasPhoto && (
          <>
            <div className="ty-photo ty-pause absolute inset-0">
              <ContentImage
                src={backdropUrl}
                alt={t("photoAlt")}
                sizes="100vw"
                priority
                className="object-cover"
              />
            </div>
            <div className="absolute inset-0 bg-black02/10" />
          </>
        )}
      </div>

      {/* ---------- The intro: typed, drawn, then broken apart ---------- */}
      <div
        aria-hidden
        className="ty-intro pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4"
      >
        <div
          className="ty-zoom flex flex-col items-center gap-[0.12em] font-sans text-[clamp(3rem,13vw,10rem)] font-bold leading-[0.95] tracking-[-0.03em]"
          style={vars({ "--ty-break": `${breakAt}ms` })}
        >
          {lines.map((chars, line) => (
            <span
              key={line}
              className={`relative inline-block px-[0.22em] py-[0.06em] ${
                line === 0 ? "-rotate-[4deg]" : "ml-[0.8em] rotate-[3deg]"
              }`}
            >
              <span
                className={`ty-draw absolute inset-0 -z-10 rounded-[0.16em] border-[0.05em] border-black02 shadow-[0_0.07em_0_0_var(--color-black02)] ${
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
      <div className="relative z-20 flex justify-center px-5 pb-6 sm:px-8 sm:pb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/watermark-devfest.svg"
          alt=""
          aria-hidden
          draggable={false}
          width={1330}
          height={189}
          className="ty-watermark ty-pause pointer-events-none h-auto w-[min(100%,42rem)] select-none"
          style={{ animationDelay: `${watermarkAt}ms` }}
        />
      </div>
    </section>
  );
}
