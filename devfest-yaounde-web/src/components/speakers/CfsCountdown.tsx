"use client";

import { useTranslations } from "next-intl";
import { Countdown } from "@/components/ui/Countdown";

/** How long is left to submit a talk — the shared `Countdown`, CFS wording. */
export function CfsCountdown({ closesAt }: { closesAt: string }) {
  const t = useTranslations("cfs");
  return (
    <Countdown
      closesAt={closesAt}
      label={t("closesIn")}
      units={{
        days: t("days"),
        hours: t("hours"),
        minutes: t("minutes"),
        seconds: t("seconds"),
      }}
    />
  );
}
