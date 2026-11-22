"use client";

import {
  CalendarCheck,
  HourglassMedium,
  Prohibit,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Countdown } from "@/components/ui/Countdown";
import { useSalesPhase } from "@/components/global/SalesPhaseProvider";

/** The countdown only appears in the final stretch (ADR 0072). */
const COUNTDOWN_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * The ticket sales cutoff, stated where people buy (ADR 0072).
 *
 * Before the cutoff: a loud yellow notice — "Ticket sales close Wednesday
 * 18 November at 12:00" — plus a live countdown once fewer than 48 hours are
 * left. After it: a calm closed panel pointing at the shop, which stays open.
 *
 * Flips on its own at the cutoff (`useBeforeInstant`), so a tab left open
 * across 12:00 changes without a reload. The server refuses a late purchase
 * either way; this is so nobody fills in a form that cannot go through.
 *
 * `closeDate` / `closeTime` / `eventDate` arrive already formatted in Yaoundé
 * time from the server (`formatCutoff`), so every visitor reads the same
 * local deadline whatever their own timezone.
 */
export function SalesCutoffNotice({
  salesCloseAt,
  closeDate,
  closeTime,
  reservationsDeadline,
  editsDeadline,
}: {
  salesCloseAt: string | null;
  closeDate: string | null;
  closeTime: string | null;
  /** Kept for callers; the closed state no longer names a date (ADR 0098). */
  eventDate?: string;
  /** When reservations end (ADR 0084); null = no deadline set. */
  reservationsDeadline?: { date: string; time: string } | null;
  /** When holders stop being able to edit (ADR 0075); null = not shown. */
  editsDeadline?: { date: string; time: string } | null;
}) {
  const t = useTranslations("pages.tickets");
  const tc = useTranslations("countdown");
  const phase = useSalesPhase();

  if (phase === "selling") {
    // No cutoff configured = nothing to announce.
    if (!salesCloseAt || !closeDate || !closeTime) return null;
    return (
      <section
        aria-labelledby="sales-cutoff-title"
        className="mt-10 flex flex-col gap-6 rounded-lg border-2 border-black02 bg-primary p-6 shadow-[0_6px_0_0_var(--color-black02)] sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div className="flex items-start gap-4">
          <HourglassMedium
            size={40}
            weight="duotone"
            aria-hidden
            className="shrink-0 text-black02"
          />
          <div>
            <h2
              id="sales-cutoff-title"
              className="font-sans text-heading-l font-bold leading-tight text-black02"
            >
              {t("salesNoticeTitle", { date: closeDate, time: closeTime })}
            </h2>
            <p className="mt-2 max-w-prose text-body-m text-black02/80">
              {t("salesNoticeBody")}
            </p>
            {editsDeadline && (
              <p className="mt-3 max-w-prose text-body-m font-bold text-black02">
                {t("salesNoticeEdits", editsDeadline)}{" "}
                <Link
                  href="/account"
                  className="underline decoration-2 underline-offset-4"
                >
                  {t("salesNoticeEditsCta")}
                </Link>
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <Countdown
            closesAt={salesCloseAt}
            label={t("salesCountdown")}
            visibleWithinMs={COUNTDOWN_WINDOW_MS}
            units={{
              days: tc("days"),
              hours: tc("hours"),
              minutes: tc("minutes"),
              seconds: tc("seconds"),
            }}
          />
        </div>
      </section>
    );
  }

  const reserving = phase === "reserving";
  const Icon = reserving ? CalendarCheck : Prohibit;
  const cta =
    "inline-flex shrink-0 items-center gap-2 self-start rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none sm:self-center";

  return (
    <section
      aria-labelledby="sales-closed-title"
      className="mt-10 flex flex-col gap-5 rounded-lg border-2 border-black02 bg-offwhite p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
    >
      <div className="flex items-start gap-4">
        <Icon
          size={40}
          weight="duotone"
          aria-hidden
          className="shrink-0 text-black02"
        />
        <div>
          <h2
            id="sales-closed-title"
            className="font-sans text-heading-l font-bold leading-tight text-black02"
          >
            {reserving ? t("reservingTitle") : t("doorTitle")}
          </h2>
          <p className="mt-2 max-w-prose text-body-m text-black02/80">
            {reserving
              ? t("reservingBody", {
                  date: reservationsDeadline?.date ?? "",
                  time: reservationsDeadline?.time ?? "",
                })
              : t("doorBody")}
          </p>
        </div>
      </div>
      {reserving ? (
        <Link href="/reserve" className={cta}>
          <CalendarCheck size={18} weight="bold" aria-hidden />
          {t("reservingCta")}
        </Link>
      ) : null}
    </section>
  );
}
