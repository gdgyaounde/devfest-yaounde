"use client";

import { useMediaQuery } from "@/lib/use-media-query";

export interface OdometerProps {
  value: number;
  /**
   * Fixed digit count, zero-padded. Keeps the width stable while digits roll
   * — a counter that grows a column mid-roll jumps sideways.
   */
  digits: number;
  /** Type styling for the digits. Defaults to the ticket counter's. */
  className?: string;
  /**
   * Announce changes politely (`aria-live`). Right for the ticket counter,
   * whose value really does change under the reader. Wrong for a figure that
   * only "changes" because it rolled in on scroll — that would announce a
   * sequence of numbers nobody asked for.
   */
  live?: boolean;
  /** What assistive tech reads. Defaults to the value. */
  srText?: string;
  /** Roll duration per digit, ms. */
  durationMs?: number;
  /**
   * Extra full turns each digit makes on its way to the value — the "view
   * counter spinning up" read. 0 (the default, and the ticket counter's)
   * moves the shortest way. With 1, a zero that stays zero still spins once,
   * so an entrance roll to "500" moves all three columns instead of one.
   */
  revolutions?: number;
  /** Delay between columns, ms, left to right — so they land in order. */
  staggerMs?: number;
}

/**
 * The digit-roll counter — built for the remaining-tickets banner (Phase 20)
 * and shared with the home page stats (Phase 21) rather than written twice.
 *
 * Not a dependency: a fixed-height column of digits per place, translated
 * with a CSS transition. A CSS transition never animates the value an
 * element is FIRST painted with, only a change from one rendered value to the
 * next — so it rolls on a real update and never on page load by accident.
 * A caller that WANTS an entrance roll (the stats) paints 0 first and sets
 * the real value when it scrolls into view.
 *
 * `prefers-reduced-motion` drops the transition: the value is simply there.
 *
 * Digit columns are `1ch` wide with tabular figures, so every digit takes the
 * width of "0" in whatever face the caller sets — exact in the mono counter,
 * and correct in the display face the stats use.
 */
export function Odometer({
  value,
  digits,
  className = "font-mono text-heading-m font-bold text-black02",
  live = true,
  srText,
  durationMs = 500,
  revolutions = 0,
  staggerMs = 0,
}: OdometerProps) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const padded = Math.max(0, Math.round(value))
    .toString()
    .padStart(digits, "0");
  const cycles = revolutions + 1;
  const strip = "0123456789".repeat(cycles).split("");

  return (
    <span
      className={`flex tabular-nums leading-none ${className}`}
      aria-live={live ? "polite" : undefined}
      aria-atomic={live ? "true" : undefined}
    >
      <span className="sr-only">{srText ?? String(value)}</span>
      <span aria-hidden className="flex overflow-hidden">
        {padded.split("").map((digit, i) => {
          /*
            Rest at 0 in the FIRST cycle; land on the digit in the LAST one.
            With revolutions 0 this is exactly the original single-cycle
            translate, so the ticket counter moves as it always did.
          */
          const stop =
            value === 0 ? Number(digit) : revolutions * 10 + Number(digit);
          return (
            <span key={i} className="relative h-[1em] w-[1ch] overflow-hidden">
              <span
                className={`absolute inset-x-0 top-0 flex flex-col ${
                  reduceMotion ? "" : "transition-transform ease-out"
                }`}
                style={{
                  transform: `translateY(-${stop}em)`,
                  transitionDuration: reduceMotion
                    ? undefined
                    : `${durationMs}ms`,
                  transitionDelay:
                    reduceMotion || !staggerMs
                      ? undefined
                      : `${i * staggerMs}ms`,
                }}
              >
                {strip.map((d, k) => (
                  <span
                    key={k}
                    className="flex h-[1em] items-center justify-center"
                  >
                    {d}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
