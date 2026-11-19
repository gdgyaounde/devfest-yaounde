"use client";

import {
  CalendarCheck,
  CalendarDots,
  CheckCircle,
  DownloadSimple,
  Handshake,
  MapPinLine,
  Scroll,
  Ticket,
} from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/Modal";
import { offlineSupported, saveAgendaOffline } from "@/lib/offline";
import { useSalesPhase } from "@/components/global/SalesPhaseProvider";
import {
  AGENDA_SEEN_KEY,
  OFFLINE_SEEN_KEY,
  PARTNERS_SEEN_KEY,
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
const EXCLUDED = /^\/[a-z]{2}\/(admin|volunteer|terms|wall|storytime)(\/|$)/;
/** The reservation page already says everything step 2 would. */
const RESERVE = /^\/[a-z]{2}\/reserve(\/|$)/;
/** The agenda step has no business on the agenda itself. */
const SCHEDULE = /^\/[a-z]{2}\/schedule(\/|$)/;

const PRIMARY =
  "inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none";
const SECONDARY =
  "inline-flex items-center rounded-pill border-2 border-black02 bg-offwhite px-6 py-3 font-sans text-body-m font-bold text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-pastel motion-reduce:transform-none";

type Step = "terms" | "notice" | "partners" | "agenda" | "offline";

/** Our two newest partners, thanked in step 3 (ADR 0085). */
const PARTNER_LOGOS = [
  { name: "Impact Hub Yaoundé", src: "/sponsors/impact-hub-yaounde.png" },
  { name: "Tech Innovation Center (TiC)", src: "/sponsors/tic-foundation.png" },
] as const;

type When = { date: string; time: string } | null;

/**
 * The site's first-visit pop-up, in up to THREE steps (ADR 0074, 0084, 0085):
 *
 *   1. "Our participation terms have changed" — only if this browser has not
 *      seen `legal.termsVersion` yet;
 *   2. "Where payments stand" — payments close at noon / reservations are open
 *      until Friday / pay cash at the venue. Phase-aware, remembered per phase;
 *   3. "Our agenda is live" — once, with a link to the Schedule page.
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
  const ta = useTranslations("agendaPopup");
  const tp = useTranslations("partnersPopup");
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
  const [agendaSeen, markAgendaSeen] = useSeenOnce(AGENDA_SEEN_KEY);
  const [partnersSeen, markPartnersSeen] = useSeenOnce(PARTNERS_SEEN_KEY);
  const [offlineSeen, markOfflineSeen] = useSeenOnce(OFFLINE_SEEN_KEY);
  // Only where a service worker can exist at all (not in `next dev`'s tab on
  // an old browser, not in private modes that refuse it).
  const canSave = useSyncExternalStore(
    () => () => {},
    offlineSupported,
    () => false,
  );
  const [ready, setReady] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reading the terms page is the same as having seen the summary.
  useEffect(() => {
    if (onTerms && !termsSeen) markTermsSeen();
  }, [onTerms, termsSeen, markTermsSeen]);

  const wantsNotice = !noticeSeen && !onReserve;
  const wantsAgenda = !agendaSeen && !SCHEDULE.test(pathname) && !onReserve;
  const wantsPartners = !partnersSeen && !onReserve;
  const wantsOffline = !offlineSeen && canSave && !onReserve;
  const wantsAnything =
    !termsSeen || wantsNotice || wantsPartners || wantsAgenda || wantsOffline;

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

  // The steps this visitor still has to see, in order. Each one only ever
  // advances; the list is frozen when the pop-up opens so the counter reads
  // "1 of 3, 2 of 3…" instead of shrinking as steps are marked seen.
  const pending: Step[] = [
    ...(!termsSeen ? (["terms"] as const) : []),
    ...(wantsNotice ? (["notice"] as const) : []),
    ...(wantsPartners ? (["partners"] as const) : []),
    ...(wantsAgenda ? (["agenda"] as const) : []),
    ...(wantsOffline ? (["offline"] as const) : []),
  ];
  const open = ready && !excluded && wantsAnything;
  const [plan, setPlan] = useState<Step[] | null>(null);
  // Frozen once, by adjusting state while rendering (not in an effect).
  if (open && plan === null) setPlan(pending);
  const step: Step = pending[0] ?? "agenda";
  const steps = plan ?? pending;
  const total = steps.length;
  const position = Math.max(1, steps.indexOf(step) + 1);
  const more = pending.length > 1;

  // The Modal focuses on open only; follow the step change ourselves.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [open, step]);

  const close =
    step === "terms"
      ? markTermsSeen
      : step === "notice"
        ? markNoticeSeen
        : step === "partners"
          ? markPartnersSeen
          : step === "offline"
            ? markOfflineSeen
            : markAgendaSeen;

  const Icon =
    step === "terms"
      ? Scroll
      : step === "offline"
        ? DownloadSimple
        : step === "agenda"
          ? CalendarDots
          : step === "partners"
            ? Handshake
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
        {total > 1 && (
          <p
            className="flex items-center gap-2 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70"
            aria-label={tn("stepOf", { step: position, total })}
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className={`h-2.5 w-8 rounded-pill border-2 border-black02 ${i + 1 === position ? "bg-primary" : "bg-offwhite"}`}
              />
            ))}
            {tn("stepOf", { step: position, total })}
          </p>
        )}
        <Icon size={40} weight="duotone" aria-hidden className="text-black02" />

        {step === "terms" ? (
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
                {more ? tn("next") : t("ok")}
              </button>
              <Link href="/terms" onClick={markTermsSeen} className={SECONDARY}>
                {t("read")}
              </Link>
            </div>
          </>
        ) : step === "partners" ? (
          <>
            <h2
              id="terms-popup-title"
              className="font-sans text-heading-l font-bold leading-tight text-black02"
            >
              {tp("title")}
            </h2>
            <ul className="flex flex-wrap items-center gap-x-10 gap-y-4">
              {PARTNER_LOGOS.map((p) => (
                <li key={p.name} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.src}
                    alt={p.name}
                    className="h-14 w-auto object-contain sm:h-16"
                  />
                </li>
              ))}
            </ul>
            <p className="text-body-m leading-relaxed text-black02/85">
              {tp("body")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-autofocus
                onClick={markPartnersSeen}
                className={PRIMARY}
              >
                {tp("ok")}
              </button>
            </div>
          </>
        ) : step === "offline" ? (
          <OfflineStep onDone={markOfflineSeen} />
        ) : step === "agenda" ? (
          <>
            <h2
              id="terms-popup-title"
              className="font-sans text-heading-l font-bold leading-tight text-black02"
            >
              {ta("title")}
            </h2>
            <p className="text-body-m leading-relaxed text-black02/85">
              {ta("body", { date: eventDate })}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/schedule"
                data-autofocus
                onClick={markAgendaSeen}
                className={PRIMARY}
              >
                {ta("cta")}
              </Link>
              <button
                type="button"
                onClick={markAgendaSeen}
                className={SECONDARY}
              >
                {tn("ok")}
              </button>
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

/**
 * Step "keep the agenda with you" (ADR 0088): one button that downloads the
 * agenda to this device, says so when it worked, and says what to do if it
 * did not. Favourites are kept too (they are saved on the device whenever
 * the schedule loads while signed in).
 */
function OfflineStep({ onDone }: { onDone: () => void }) {
  const t = useTranslations("offlinePopup");
  const tn = useTranslations("salesPopup");
  const locale = useLocale() === "en" ? "en" : "fr";
  const [state, setState] = useState<"idle" | "saving" | "done" | "failed">(
    "idle",
  );
  const [progress, setProgress] = useState<[number, number]>([0, 0]);

  async function save() {
    setState("saving");
    const result = await saveAgendaOffline(locale, (done, total) =>
      setProgress([done, total]),
    );
    setState(result.ok ? "done" : "failed");
  }

  return (
    <>
      <h2
        id="terms-popup-title"
        className="font-sans text-heading-l font-bold leading-tight text-black02"
      >
        {state === "done" ? t("doneTitle") : t("title")}
      </h2>
      <p role="status" className="text-body-m leading-relaxed text-black02/85">
        {state === "done"
          ? t("doneBody")
          : state === "failed"
            ? t("failed")
            : state === "saving"
              ? t("saving", {
                  done: progress[0],
                  total: Math.max(progress[1], progress[0]),
                })
              : t("body")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {state === "done" ? (
          <button
            type="button"
            data-autofocus
            onClick={onDone}
            className={PRIMARY}
          >
            <CheckCircle size={20} weight="bold" aria-hidden />
            {t("ok")}
          </button>
        ) : (
          <>
            <button
              type="button"
              data-autofocus
              disabled={state === "saving"}
              onClick={() => void save()}
              className={`${PRIMARY} disabled:opacity-60`}
            >
              <DownloadSimple size={20} weight="bold" aria-hidden />
              {state === "failed" ? t("retry") : t("cta")}
            </button>
            <button type="button" onClick={onDone} className={SECONDARY}>
              {tn("ok")}
            </button>
          </>
        )}
      </div>
    </>
  );
}
