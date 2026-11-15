"use client";

import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { mailtoHref } from "@/lib/mailto";
import { CHAPTER_EMAIL } from "@/lib/site-config";
import { signInWithGoogle, useSession } from "@/lib/use-session";

type Status =
  | "idle"
  | "claiming"
  | "claimed"
  | "already_claimed"
  | "not_claimable"
  | "expired"
  | "not_found"
  | "invalid_token"
  | "rate_limited"
  | "error";

/**
 * `/{locale}/account/claim/{ticketId}/{token}` — the landing page a "claim
 * your ticket" email links to (PHASE22 §C).
 *
 * Sign-in first, claim second, and the claim itself fires automatically the
 * moment a session exists rather than behind a second button: the person
 * already made their one decision by clicking the emailed link, and Google's
 * own consent screen is already a confirmation step in front of the sign-in
 * — a second "are you sure" here would be one more click for no new
 * information.
 *
 * `useRef`, not a state flag, guards against submitting twice: React can
 * run an effect twice in development, and a plain state check inside the
 * effect body reads its own stale closure before the first call's setState
 * commits, and would win the race whichever value happened to render first.
 */
export function ClaimTicket({
  ticketId,
  token,
}: {
  ticketId: string;
  token: string;
}) {
  const t = useTranslations("pages.claimTicket");
  const tMail = useTranslations("mail");
  const locale = useLocale();
  const { profile, loading } = useSession();
  const [status, setStatus] = useState<Status>("idle");
  const [attendeeName, setAttendeeName] = useState<string | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (!profile || submitted.current) return;
    submitted.current = true;
    setStatus("claiming");

    (async () => {
      try {
        const res = await fetch("/api/tickets/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId, token }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setAttendeeName(body.attendeeName ?? null);
          setStatus("claimed");
          return;
        }
        const code = body.error as string | undefined;
        setStatus(
          code && code in STATUS_MESSAGES
            ? (code as FailureStatus)
            : ("error" as const),
        );
      } catch {
        setStatus("error");
      }
    })();
  }, [profile, ticketId, token]);

  if (loading) {
    return <p className="text-body-l text-black02/70">{t("loading")}</p>;
  }

  if (!profile) {
    return (
      <div className="max-w-md rounded-lg border-2 border-black02 bg-offwhite p-7">
        <h2 className="font-sans text-heading-l font-bold text-black02">
          {t("signInTitle")}
        </h2>
        <p className="mt-3 text-body-m text-black02/80">{t("signInPrompt")}</p>
        <button
          type="button"
          onClick={() =>
            signInWithGoogle(
              locale,
              `/${locale}/account/claim/${ticketId}/${token}`,
            )
          }
          className="mt-6 inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)]"
        >
          {t("continueWithGoogle")}
        </button>
      </div>
    );
  }

  if (status === "idle" || status === "claiming") {
    return <p className="text-body-l text-black02/70">{t("claiming")}</p>;
  }

  if (status === "claimed") {
    return (
      <div className="max-w-md rounded-lg border-2 border-black02 bg-offwhite p-7">
        <CheckCircle
          size={32}
          weight="fill"
          aria-hidden
          className="text-blue"
        />
        <h2 className="mt-3 font-sans text-heading-l font-bold text-black02">
          {t("successTitle")}
        </h2>
        <p className="mt-3 text-body-m text-black02/80">
          {attendeeName
            ? t("successBodyNamed", { name: attendeeName })
            : t("successBody")}
        </p>
        <Link
          href="/account"
          className="mt-6 inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)]"
        >
          {t("viewMyTickets")}
        </Link>
      </div>
    );
  }

  const message = STATUS_MESSAGES[status] ?? STATUS_MESSAGES.error;

  return (
    <div className="max-w-md rounded-lg border-2 border-black02 bg-offwhite p-7">
      <WarningCircle size={32} weight="fill" aria-hidden className="text-red" />
      <h2 className="mt-3 font-sans text-heading-l font-bold text-black02">
        {t(message.title)}
      </h2>
      <p className="mt-3 text-body-m text-black02/80">{t(message.body)}</p>
      {message.contact && (
        <a
          href={mailtoHref(CHAPTER_EMAIL, {
            subject: tMail("claim.subject"),
            // The ticket's id, so we can find it — never the claim token.
            body: tMail("claim.body", { ticketId }),
          })}
          className="mt-4 inline-block font-mono text-caption font-bold text-black02 underline decoration-2 underline-offset-4"
        >
          {t("contact", { email: CHAPTER_EMAIL })}
        </a>
      )}
    </div>
  );
}

type FailureStatus = Exclude<Status, "idle" | "claiming" | "claimed">;

/** Which title/body keys to show per failure, and whether to offer the contact line. */
const STATUS_MESSAGES: Record<
  FailureStatus,
  { title: string; body: string; contact?: boolean }
> = {
  already_claimed: {
    title: "alreadyClaimedTitle",
    body: "alreadyClaimedBody",
  },
  not_claimable: { title: "notClaimableTitle", body: "notClaimableBody" },
  expired: { title: "expiredTitle", body: "expiredBody", contact: true },
  not_found: { title: "notFoundTitle", body: "notFoundBody", contact: true },
  invalid_token: { title: "invalidTitle", body: "invalidBody", contact: true },
  rate_limited: { title: "errorTitle", body: "errorBody", contact: true },
  error: { title: "errorTitle", body: "errorBody", contact: true },
};
