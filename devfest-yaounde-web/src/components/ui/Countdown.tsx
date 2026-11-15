"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * How long is left before a deadline — the call for speakers, the ticket
 * sales cutoff (ADR 0072). Strings come in as props so each surface keeps
 * its own wording in its own message namespace.
 *
 * SERVER-RENDERED AS NOTHING, then filled in on the client. A countdown is
 * the one piece of a page that cannot be prerendered honestly: the HTML would
 * be cached with whatever "3 days left" was true when it was built, and the
 * next person to read it would be told something false. So the first paint is
 * the deadline in words, and the ticking version replaces it once there is a
 * clock to read.
 *
 * Under reduced motion it does not tick at all — it shows the days remaining
 * and stops. A number changing every second is motion, and someone who asked
 * for less of it has not asked for less information.
 */
export interface CountdownUnits {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
}

export function Countdown({
  closesAt,
  label,
  units,
  visibleWithinMs,
  tone = "offwhite",
}: {
  closesAt: string;
  label: string;
  units: CountdownUnits;
  /**
   * Only show once the deadline is this close (e.g. the final 48 h of ticket
   * sales). Omitted = always show while time remains.
   */
  visibleWithinMs?: number;
  /** Chip fill. `pastel` reads on an off-white card, `offwhite` on yellow. */
  tone?: "offwhite" | "pastel";
}) {
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const end = Date.parse(closesAt);
    if (Number.isNaN(end)) return;

    const tick = () => setRemaining(end - Date.now());
    tick();
    // A minute is enough for a deadline weeks away, and it is 60x less work
    // than a second hand nobody is watching.
    const id = window.setInterval(tick, calm ? 60_000 : 1000);
    return () => window.clearInterval(id);
  }, [closesAt, calm]);

  if (remaining === null || remaining <= 0) return null;
  if (visibleWithinMs !== undefined && remaining > visibleWithinMs) return null;

  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  /*
    Under reduced motion it shows the coarsest unit that is still useful —
    days while there are days, hours in the final day — and updates once a
    minute rather than ticking.
  */
  const parts: { value: number; label: string }[] = calm
    ? days > 0
      ? [{ value: days, label: units.days }]
      : [
          { value: hours, label: units.hours },
          { value: minutes, label: units.minutes },
        ]
    : [
        { value: days, label: units.days },
        { value: hours, label: units.hours },
        { value: minutes, label: units.minutes },
        { value: secs, label: units.seconds },
      ];

  return (
    <div>
      <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
        {label}
      </p>
      {/*
        `aria-live` is deliberately absent. A screen reader announcing a new
        number every second would make the rest of the page unusable; the
        deadline is stated in words next to this, which is what actually needs
        to be readable.
      */}
      <ul aria-hidden className="mt-2 flex flex-wrap gap-2">
        {parts.map((part) => (
          <li
            key={part.label}
            className={`flex min-w-16 flex-col items-center rounded-lg border-2 border-black02 px-3 py-2 ${
              tone === "pastel" ? "bg-pastel" : "bg-offwhite"
            }`}
          >
            <span className="font-sans text-heading-l font-bold tabular-nums leading-none text-black02">
              {String(part.value).padStart(2, "0")}
            </span>
            <span className="mt-1 font-mono text-caption uppercase text-black02/65">
              {part.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
