"use client";

import { DeviceMobile } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { signInWithGoogle } from "@/lib/use-session";
import type { Profile } from "@/lib/use-session";

/**
 * The payment step, shared by tickets and shop.
 *
 * Two things here are load-bearing rather than decorative:
 *
 * 1. **Mobile Money only, with NO card control rendered at all.** The
 *    integration does not support cards, and a disabled "card" button reads
 *    as a bug on someone's phone rather than a decision (GAPS.md G1).
 *
 * 2. **The refund acknowledgment gates the pay button.** It is stated in
 *    body-sized text on the page someone is about to pay from — not a link,
 *    not a collapsed block, not small print. Money is involved; burying it
 *    would be a dark pattern. The gate lives here, in one place, so both
 *    checkouts inherit the version that was actually verified to block.
 *
 *    The COPY is per-surface, because the policies genuinely differ: a seat
 *    on a day is non-refundable outright, while goods can be exchanged when
 *    they arrive damaged or in the wrong size. Passing the strings in keeps
 *    one gate with two honest descriptions, rather than one description
 *    stretched over two different promises.
 */
export function PaymentStep({
  phone,
  setPhone,
  acceptedTerms,
  setAcceptedTerms,
  profile,
  sessionLoading,
  signInNext,
  terms,
  extra,
}: {
  phone: string;
  setPhone: (v: string) => void;
  acceptedTerms: boolean;
  setAcceptedTerms: (v: boolean) => void;
  profile: Profile | null;
  sessionLoading: boolean;
  signInNext: string;
  /**
   * Per-surface refund wording — see the note above. `link` is an optional
   * on-site page the acknowledgment refers to (the participation terms on
   * the ticket surface, ADR 0074), opened in a new tab so the half-filled
   * checkout is not lost.
   */
  terms: {
    title: string;
    body: string;
    ack: string;
    link?: { href: string; label: string };
  };
  /** Anything the surface adds. */
  extra?: ReactNode;
}) {
  const t = useTranslations("pages.tickets");
  const locale = useLocale();

  return (
    <div className="flex max-w-md flex-col gap-6">
      <div className="flex items-start gap-3 rounded-lg border-2 border-black02 bg-offwhite p-5">
        <DeviceMobile
          size={22}
          weight="bold"
          className="mt-0.5 shrink-0 text-black02"
        />
        <div>
          <p className="text-body-m font-bold text-black02">{t("momoTitle")}</p>
          <p className="mt-1 text-body-m text-black02/75">{t("momoBody")}</p>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-body-m font-bold text-black02">
          {t("phoneLabel")}
        </span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="237690000000"
          inputMode="numeric"
          className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-2.5 font-mono text-body-m text-black02"
        />
        <span className="text-caption text-black02/65">{t("phoneHint")}</span>
      </label>

      {extra}

      <div className="rounded-lg border-2 border-black02 bg-pastel p-5">
        <p className="font-sans text-body-l font-bold text-black02">
          {terms.title}
        </p>
        <p className="mt-2 text-body-m text-black02/80">{terms.body}</p>
        {terms.link && (
          <a
            href={terms.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-body-m font-bold text-black02 underline decoration-2 underline-offset-4 hover:decoration-primary"
          >
            {terms.link.label}
          </a>
        )}
        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded-sm border-2 border-black02 accent-[var(--color-primary)]"
          />
          {/*
           * `terms.ack`, NOT t("refundAck").
           *
           * This rendered the tickets wording on both surfaces while the
           * prop sat unused — so a shop buyer ticked "I understand tickets
           * are non-refundable" for a hoodie. Worse than wrong copy: the
           * server records the SHOP sentence as the evidence of consent
           * (terms.ts), so the stored record described something the buyer
           * was never shown. That is exactly the failure ADR 0022 exists to
           * prevent, arriving through the screen instead of the request body.
           */}
          <span className="text-body-m font-bold text-black02">
            {terms.ack}
          </span>
        </label>
      </div>

      {!sessionLoading && !profile && (
        <div className="rounded-lg border-2 border-black02 bg-offwhite p-5">
          <p className="text-body-m font-bold text-black02">
            {t("signInRequired")}
          </p>
          <button
            type="button"
            onClick={() => signInWithGoogle(locale, signInNext)}
            className="mt-4 inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)]"
          >
            {t("continueWithGoogle")}
          </button>
        </div>
      )}
    </div>
  );
}
