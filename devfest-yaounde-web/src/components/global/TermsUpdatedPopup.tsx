"use client";

import {
  CalendarCheck,
  MapPinLine,
  Scroll,
  Ticket,
} from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/Modal";
import { useSalesPhase } from "@/components/global/SalesPhaseProvider";
import {
  salesNoticeSeenKey,
  termsSeenKey,
  useSeenOnce,
} from "@/lib/use-seen-once";

/**
 * Once the preloader has gone, how long to let the page arrive before the
 * pop-up takes focus. The hero's entrance runs for roughly two seconds after
 * the splash lifts (ADR 0041); opening during it would steal focus from a
 * page nobody has seen yet and cut the entrance short.
 */
const SETTLE_MS = 2600;
const SETTLE_CALM_MS = 600;

/** Where it never appears: the dashboard, the terms page itself, the wall. */
const EXCLUDED = /^\/[a-z]{2}\/(admin|volunteer|terms|wall)(\/|$)/;
/** The reservation page already says everything step 2 would. */
const RESERVE = /^\/[a-z]{2}\/reserve(\/|$)/;

const PRIMARY =
  "inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none";
const SECONDARY =
  "inline-flex items-center rounded-pill border-2 border-black02 bg-offwhite px-6 py-3 font-sans text-body-m font-bold text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-pastel motion-reduce:transform-none";

type When = { date: string; time: string } | null;

/**
 * The site's first-visit pop-up, in up to TWO steps (ADR 0074, 0084):
 *
 *   1. "Our participation terms have changed" — only if this browser has not
 *      seen `legal.termsVersion` yet;
 *   2. "Where payments stand" — payments close at noon / reservations are open
 *      until Friday / pay cash at the venue. Phase-aware, remembered per phase.
 *
 * Someone who already saw the terms goes straight to step 2; someone who has
 * seen both never sees it. Step 2 is what the user needs on the day it
 * matters, so it is NOT tied to the terms version.
 *
 * - Waits for the preloader to leave the DOM, then for the hero entrance, so
 *   it never steals focus mid-animation; under reduced motion it waits less.
 * - Never on /admin, /volunteer or the wall; never on /terms (visiting it
 *   counts as having seen step 1); step 2 not on /reserve.
 * - The shared `Modal` (dialog variant) supplies the focus trap, Escape,
 *   scroll lock, `aria-labelledby` and the reduced-motion-safe entrance. It
 *   only focuses on OPEN, so each step marks its primary button
 *   `data-autofocus` and focus is moved when the step changes.
 */
export function TermsUpdatedPopup({
  version,
  eventDate,
  salesClose,
  reservationsClose,
  venue,
  mapUrl,
}: {
  version: string;
  /** Already formatted for this locale, e.g. "21 novembre 2026". */
  eventDate: string;
  /** Payments close (Yaoundé wall time), formatted. */
  salesClose: When;
  /** Reservations close, formatted. */
  reservationsClose: When;
  venue: string;
  mapUrl: string;
}) {
  const t = useTranslations("termsPopup");
  const tn = useTranslations("salesPopup");
  const tCommon = useTranslations("common");
  const phase = useSalesPhase();
  const pathname = usePathname() ?? "";
  const excluded = EXCLUDED.test(pathname);
  const onTerms = /^\/[a-z]{2}\/terms(\/|$)/.test(pathname);
  const onReserve = RESERVE.test(pathname);
  const [termsSeen, markTermsSeen] = useSeenOnce(
    version ? termsSeenKey(version) : null,
  );
  const [noticeSeen, markNoticeSeen] = useSeenOnce(salesNoticeSeenKey(phase));
  const [ready, setReady] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reading the terms page is the same as having seen the summary.
  useEffect(() => {
    if (onTerms && !termsSeen) markTermsSeen();
  }, [onTerms, termsSeen, markTermsSeen]);

  const wantsNotice = !noticeSeen && !onReserve;
  const wantsAnything = !termsSeen || wantsNotice;

  useEffect(() => {
    if (!wantsAnything || excluded || ready) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let settle: number | undefined;
    // Poll for the splash leaving rather than observing the whole subtree:
    // it is one element, gone within ~1.6 s, and a 200 ms check costs nothing.
    const poll = window.setInterval(() => {
      if (document.querySelector("[data-preloader]")) return;
      window.clearInterval(poll);
      settle = window.setTimeout(
        () => setReady(true),
        calm ? SETTLE_CALM_MS : SETTLE_MS,
      );
    }, 200);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(settle);
    };
  }, [wantsAnything, excluded, ready]);

  // Step 1 while the terms are unseen; the moment they are marked seen the
  // modal simply moves on to step 2 (or closes, if there is none).
  const step: 1 | 2 = !termsSeen ? 1 : 2;
  const open = ready && !excluded && wantsAnything;
  const twoSteps = !termsSeen && wantsNotice;

  // The Modal focuses on open only; follow the step change ourselves.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [open, step]);

  const close = step === 1 ? markTermsSeen : markNoticeSeen;

  const Icon =
    step === 1
      ? Scroll
      : phase === "selling"
        ? Ticket
        : phase === "reserving"
          ? CalendarCheck
          : MapPinLine;

  return (
    <Modal
      open={open}
      onClose={close}
      labelledBy="terms-popup-title"
      closeLabel={tCommon("close")}
      variant="dialog"
    >
      <div ref={panelRef} className="flex flex-col gap-5 p-2 sm:p-4">
        {twoSteps && (
          <p
            className="flex items-center gap-2 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70"
            aria-label={tn("stepOf", { step, total: 2 })}
          >
            <span
              aria-hidden
              className={`h-2.5 w-8 rounded-pill border-2 border-black02 ${step === 1 ? "bg-primary" : "bg-offwhite"}`}
            />
            <span
              aria-hidden
              className={`h-2.5 w-8 rounded-pill border-2 border-black02 ${step === 2 ? "bg-primary" : "bg-offwhite"}`}
            />
            {tn("stepOf", { step, total: 2 })}
          </p>
        )}
        <Icon size={40} weight="duotone" aria-hidden className="text-black02" />

        {step === 1 ? (
          <>
            <h2
              id="terms-popup-title"
              className="font-sans text-heading-l font-bold leading-tight text-black02"
            >
              {t("title")}
            </h2>
            <p className="text-body-m leading-relaxed text-black02/85">
              {t("body", { date: eventDate })}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-autofocus
                onClick={markTermsSeen}
                className={PRIMARY}
              >
                {wantsNotice ? tn("next") : t("ok")}
              </button>
              <Link href="/terms" onClick={markTermsSeen} className={SECONDARY}>
                {t("read")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2
              id="terms-popup-title"
              className="font-sans text-heading-l font-bold leading-tight text-black02"
            >
              {phase === "selling"
                ? tn("sellingTitle", { time: salesClose?.time ?? "" })
                : phase === "reserving"
                  ? tn("reservingTitle")
                  : tn("doorTitle")}
            </h2>
            <p className="text-body-m leading-relaxed text-black02/85">
              {phase === "selling"
                ? tn("sellingBody", {
                    date: salesClose?.date ?? "",
                    reserveDate: reservationsClose?.date ?? "",
                    reserveTime: reservationsClose?.time ?? "",
                  })
                : phase === "reserving"
                  ? tn("reservingBody", {
                      date: reservationsClose?.date ?? "",
                      time: reservationsClose?.time ?? "",
                    })
                  : tn("doorBody", { venue, date: eventDate })}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {phase === "selling" && (
                <Link
                  href="/tickets"
                  data-autofocus
                  onClick={markNoticeSeen}
                  className={PRIMARY}
                >
                  {tn("sellingCta")}
                </Link>
              )}
              {phase === "reserving" && (
                <Link
                  href="/reserve"
                  data-autofocus
                  onClick={markNoticeSeen}
                  className={PRIMARY}
                >
                  {tn("reservingCta")}
                </Link>
              )}
              {phase === "door" && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-autofocus
                  onClick={markNoticeSeen}
                  className={PRIMARY}
                >
                  {tn("doorCta")}
                </a>
              )}
              <button
                type="button"
                onClick={markNoticeSeen}
                className={SECONDARY}
              >
                {tn("ok")}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
