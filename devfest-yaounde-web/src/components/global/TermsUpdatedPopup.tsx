"use client";

import { Scroll } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/Modal";
import { termsSeenKey, useSeenOnce } from "@/lib/use-seen-once";

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

/**
 * "Our participation terms have changed" — once per browser, per version
 * (ADR 0074).
 *
 * - Remembered under `devfest:terms-seen:<termsVersion>` (`useSeenOnce`), so
 *   bumping `legal.termsVersion` in the dashboard shows it to everyone once
 *   more, and nothing else does.
 * - Never on /admin, never on /terms (visiting it counts as seen), never on
 *   the wall, which is a full-screen display surface.
 * - Waits for the preloader to leave the DOM, then for the hero entrance, so
 *   it never steals focus mid-animation; under reduced motion it waits less.
 * - The shared `Modal` (dialog variant) supplies the focus trap, Escape,
 *   scroll lock, `aria-labelledby` and the reduced-motion-safe entrance.
 */
export function TermsUpdatedPopup({
  version,
  eventDate,
}: {
  version: string;
  /** Already formatted for this locale, e.g. "21 novembre 2026". */
  eventDate: string;
}) {
  const t = useTranslations("termsPopup");
  const tCommon = useTranslations("common");
  const pathname = usePathname() ?? "";
  const excluded = EXCLUDED.test(pathname);
  const onTerms = /^\/[a-z]{2}\/terms(\/|$)/.test(pathname);
  const [seen, markSeen] = useSeenOnce(version ? termsSeenKey(version) : null);
  const [ready, setReady] = useState(false);

  // Reading the terms page is the same as having seen the summary.
  useEffect(() => {
    if (onTerms && !seen) markSeen();
  }, [onTerms, seen, markSeen]);

  useEffect(() => {
    if (seen || excluded || ready) return;
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
  }, [seen, excluded, ready]);

  const open = ready && !seen && !excluded;

  return (
    <Modal
      open={open}
      onClose={markSeen}
      labelledBy="terms-popup-title"
      closeLabel={tCommon("close")}
      variant="dialog"
    >
      <div className="flex flex-col gap-5 p-2 sm:p-4">
        <Scroll
          size={40}
          weight="duotone"
          aria-hidden
          className="text-black02"
        />
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
            onClick={markSeen}
            className="inline-flex items-center rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none"
          >
            {t("ok")}
          </button>
          <Link
            href="/terms"
            onClick={markSeen}
            className="inline-flex items-center rounded-pill border-2 border-black02 bg-offwhite px-6 py-3 font-sans text-body-m font-bold text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-pastel motion-reduce:transform-none"
          >
            {t("read")}
          </Link>
        </div>
      </div>
    </Modal>
  );
}
