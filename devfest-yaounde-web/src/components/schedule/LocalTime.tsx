"use client";

import { Globe } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { useEventDates } from "@/components/global/EventDateProvider";
import { localTimeFor } from "@/lib/local-time";

const subscribe = () => () => {};

/**
 * "03:20 your time (EST)" beside a session, for anyone following from another
 * time zone (ADR 0092). Renders nothing on Yaoundé time, and nothing on the
 * server (the zone is the visitor's own), so it never causes a hydration
 * mismatch.
 */
export function LocalTime({ time }: { time?: string }) {
  const t = useTranslations("home.schedule");
  const locale = useLocale();
  const date = useEventDates()[0];
  // The snapshot must be a stable VALUE, so it is a string, parsed below.
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      const x = time && date ? localTimeFor(date, time, locale) : null;
      return x ? `${x.time}|${x.zone}|${x.dayShift}` : "";
    },
    () => "",
  );
  if (!raw) return null;
  const [shown, zone, shift] = raw.split("|");
  const info = { time: shown, zone, dayShift: Number(shift) };
  return (
    <span className="flex items-center gap-1.5 font-mono text-caption text-black02/70">
      <Globe size={14} weight="bold" aria-hidden />
      {t("yourTime", { time: info.time, zone: info.zone })}
      {info.dayShift !== 0 &&
        ` · ${info.dayShift > 0 ? t("nextDay") : t("prevDay")}`}
    </span>
  );
}
