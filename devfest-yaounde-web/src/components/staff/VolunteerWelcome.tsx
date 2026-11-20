"use client";

import { Confetti } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { VOLUNTEER_WELCOME_KEY, useSeenOnce } from "@/lib/use-seen-once";

/**
 * The volunteers' first pop-up (ADR 0090): a warm, slightly cheeky welcome
 * to the volunteer crew, wrapped around the three things that actually matter
 * — read the guide, the phone is the tool, and when in doubt call an
 * organiser. Shown once per browser, on the guide (where a new volunteer
 * lands first).
 */
export function VolunteerWelcome() {
  const t = useTranslations("staff.welcome");
  const tc = useTranslations("common");
  const [seen, markSeen] = useSeenOnce(VOLUNTEER_WELCOME_KEY);
  const points = ["a", "b", "c", "d"] as const;

  return (
    <Modal
      open={!seen}
      onClose={markSeen}
      labelledBy="volunteer-welcome-title"
      closeLabel={tc("close")}
      variant="dialog"
    >
      <div className="flex flex-col gap-4 p-2 sm:p-4">
        <Confetti size={44} weight="duotone" aria-hidden />
        <h2
          id="volunteer-welcome-title"
          className="font-sans text-heading-l font-bold leading-tight text-black02"
        >
          {t("title")}
        </h2>
        <p className="text-body-m leading-relaxed text-black02/90">
          {t("intro")}
        </p>
        <ul className="flex flex-col gap-3">
          {points.map((k) => (
            <li key={k} className="flex gap-3 text-body-m text-black02">
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border-2 border-black02 bg-primary font-mono text-caption font-bold"
              >
                {k.toUpperCase()}
              </span>
              <span>{t(`points.${k}`)}</span>
            </li>
          ))}
        </ul>
        <p className="text-body-m font-bold text-black02">{t("outro")}</p>
        <div>
          <button
            type="button"
            data-autofocus
            onClick={markSeen}
            className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-l font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)]"
          >
            {t("cta")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
