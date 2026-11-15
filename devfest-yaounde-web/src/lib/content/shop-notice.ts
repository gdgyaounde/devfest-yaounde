import "server-only";
import { getTranslations } from "next-intl/server";
import { eventHasEnded, formatCutoff } from "@/lib/event";
import { loadSettings } from "./settings";

/**
 * The shop's late-delivery notice, resolved for one locale (ADR 0072).
 *
 * Null once the event has ended — "may not be ready by event day" means
 * nothing after it. The cron sweep rebuilds every page when the event ends,
 * so the static shop pages drop it then.
 *
 * The date is the event's own, as a short weekday ("Sat 21 Nov" /
 * "sam. 21 nov."), so moving the event in the dashboard moves the notice.
 */
export async function shopLateNotice(locale: string): Promise<string | null> {
  const settings = await loadSettings();
  if (eventHasEnded(new Date(), [settings.eventDate])) return null;
  const l = locale === "en" ? "en" : "fr";
  // Midday Yaoundé time: a bare date read at midnight could land on the
  // previous day in another timezone.
  const day = formatCutoff(l, `${settings.eventDate}T12:00:00+01:00`);
  if (!day) return null;
  const t = await getTranslations({ locale: l, namespace: "pages.shop" });
  return t("lateNotice", { date: day.short });
}
