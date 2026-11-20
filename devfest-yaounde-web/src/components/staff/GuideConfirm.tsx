"use client";

import { CheckCircle, LockKeyOpen } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * "I have read and understood the guide" (ADR 0090). Ticking the box enables
 * the button; the button records the confirmation and opens the tools.
 */
export function GuideConfirm({ done }: { done: boolean }) {
  const t = useTranslations("staff.guide");
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/staff/guide-ack", { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      router.push("/volunteer");
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-lg border-2 border-black02 bg-primary/40 p-5">
        <CheckCircle size={28} weight="duotone" aria-hidden />
        <p className="font-sans text-body-l font-bold text-black02">
          {t("confirmed")}
        </p>
        <button
          type="button"
          onClick={() => router.push("/volunteer")}
          className="ml-auto rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)]"
        >
          {t("toTools")}
        </button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="confirm-title"
      className="rounded-lg border-2 border-black02 bg-primary p-5 shadow-[0_6px_0_0_var(--color-black02)] sm:p-6"
    >
      <h2
        id="confirm-title"
        className="font-sans text-heading-m font-bold text-black02"
      >
        {t("confirmTitle")}
      </h2>
      <p className="mt-2 text-body-m text-black02/85">{t("confirmBody")}</p>
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-6 w-6 shrink-0 accent-black"
        />
        <span className="text-body-l font-bold text-black02">
          {t("confirmLabel")}
        </span>
      </label>
      <button
        type="button"
        disabled={!checked || busy}
        onClick={() => void confirm()}
        className="mt-5 inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-6 py-3 font-sans text-body-l font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-opacity disabled:pointer-events-none disabled:opacity-40"
      >
        <LockKeyOpen size={22} weight="bold" aria-hidden />
        {busy ? t("confirming") : t("unlock")}
      </button>
      {failed && (
        <p role="alert" className="mt-3 text-body-m text-black02">
          {t("confirmFailed")}
        </p>
      )}
    </section>
  );
}
