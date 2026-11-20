"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check, X as XIcon } from "@phosphor-icons/react";
import type { Pack } from "@/lib/staff/pack";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StationTier, StaffTicketHit } from "@/lib/staff/results";
import { normaliseBadgeCode, type CheckInResult } from "@/lib/tickets/check-in";
import {
  CameraPanel,
  CodeEntry,
  FailurePanel,
  NextButton,
  RecentList,
  ResultPanel,
  StationShell,
  TicketSearch,
  staffRequest,
  useClockText,
  type Failure,
  type RecentRow,
} from "./kit";
import { ReservationDoor } from "./ReservationDoor";
import { buzz, useQrScanner } from "./use-qr-scanner";

/** How long a clean success stays up before the camera looks again. */
const AUTO_RESUME_MS = 6000;

type Selector = { badgeCode: string } | { ticketId: string };

type Outcome =
  | { kind: "result"; result: CheckInResult; code: string | null }
  | { kind: "failure"; failure: Failure; selector: Selector }
  | { kind: "not-a-badge" }
  | { kind: "invalid" };

/**
 * The door (ADR 0078, 0079): scan or type a ticket code, or find the person
 * by name. Everyone with a code is checked in here; a free pass taken on
 * Bevy has no code and needs none.
 */
export function DoorStation({ tiers }: { tiers: Record<string, StationTier> }) {
  const t = useTranslations("staff.door");
  const tc = useTranslations("staff.common");
  const clock = useClockText();

  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [admitted, setAdmitted] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const resumeTimer = useRef<number | null>(null);
  const handled = useRef<string | null>(null);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<ReturnType<typeof useQrScanner> | null>(null);

  const next = useCallback(() => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
    setOutcome(null);
    scannerRef.current?.resume(handled.current);
    if (!scannerRef.current?.wantsCamera()) inputRef.current?.focus();
  }, []);

  const submit = useCallback(
    async (selector: Selector): Promise<CheckInResult | null> => {
      scannerRef.current?.pause();
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
      handled.current = "badgeCode" in selector ? selector.badgeCode : null;
      setBusy(true);
      const response = await staffRequest<CheckInResult>(
        "/api/check-in",
        { method: "POST", body: JSON.stringify(selector) },
        [200, 404],
      );
      setBusy(false);
      setNow(new Date());

      if (response.kind !== "ok") {
        setOutcome({ kind: "failure", failure: response, selector });
        buzz(260);
        return null;
      }

      const result = response.body;
      setOutcome({ kind: "result", result, code: handled.current });
      setRecent((rows) =>
        [
          {
            id: nextId.current++,
            label:
              result.status === "not_found"
                ? (handled.current ?? "—")
                : result.attendeeName,
            detail:
              result.status === "checked_in"
                ? t("statusIn")
                : result.status === "already_checked_in"
                  ? t("statusAgain")
                  : t("statusUnknown"),
            tone:
              result.status === "checked_in"
                ? ("ok" as const)
                : result.status === "already_checked_in"
                  ? ("warn" as const)
                  : ("bad" as const),
            at: new Date(),
          },
          ...rows,
        ].slice(0, 8),
      );
      if (result.status === "checked_in") setAdmitted((n) => n + 1);

      const clean = result.status === "checked_in" && !result.refund;
      buzz(clean ? 70 : result.status === "not_found" ? 260 : [70, 90, 70]);
      if (clean) resumeTimer.current = window.setTimeout(next, AUTO_RESUME_MS);
      return result;
    },
    [next, t],
  );

  const scanner = useQrScanner({
    onCode: (code) => void submit({ badgeCode: code }),
    onJunk: () => setOutcome((current) => current ?? { kind: "not-a-badge" }),
  });
  // Read by the callbacks above, which are created before the scanner is.
  useEffect(() => {
    scannerRef.current = scanner;
  }, [scanner]);

  const tierName = (id: string) => tiers[id]?.name ?? id;

  return (
    <StationShell
      title={t("title")}
      counter={tc("counter", { count: admitted })}
    >
      <CameraPanel scanner={scanner} busy={busy} paused={outcome !== null} />

      <div aria-live="assertive" aria-atomic="true">
        {busy && <ResultPanel tone="neutral" title={tc("checking")} />}
        {!busy && outcome?.kind === "failure" && (
          <FailurePanel
            failure={outcome.failure}
            onRetry={() => void submit(outcome.selector)}
            onNext={next}
          />
        )}
        {!busy && outcome?.kind === "not-a-badge" && (
          <FailurePanel failure={{ kind: "not-a-badge" }} onNext={next} />
        )}
        {!busy && outcome?.kind === "invalid" && (
          <FailurePanel failure={{ kind: "invalid" }} onNext={next} />
        )}
        {!busy && outcome?.kind === "result" && (
          <DoorResult
            result={outcome.result}
            code={outcome.code}
            tiers={tiers}
            now={now}
            clock={clock}
            onNext={next}
          />
        )}
      </div>

      <CodeEntry
        inputRef={inputRef}
        submitLabel={t("submit")}
        busy={busy}
        onSubmit={(typed) => {
          const code = normaliseBadgeCode(typed);
          if (!code) {
            scanner.pause();
            setOutcome({ kind: "invalid" });
            buzz(260);
            return false;
          }
          void submit({ badgeCode: code });
          return true;
        }}
      />

      <TicketSearch
        actionLabel={t("searchAction")}
        doneLabel={t("searchDone")}
        done={(hit) => hit.checkedInAt !== null}
        busy={busy}
        tierName={tierName}
        onPick={async (hit: StaffTicketHit) => {
          const result = await submit({ ticketId: hit.id });
          if (!result || result.status === "not_found") return null;
          return {
            checkedInAt:
              result.status === "already_checked_in"
                ? result.checkedInAt
                : new Date().toISOString(),
          };
        }}
      />

      <ReservationDoor />

      <RecentList rows={recent} />
    </StationShell>
  );
}

function DoorResult({
  result,
  code,
  tiers,
  now,
  clock,
  onNext,
}: {
  result: CheckInResult;
  code: string | null;
  tiers: Record<string, StationTier>;
  now: Date;
  clock: ReturnType<typeof useClockText>;
  onNext: () => void;
}) {
  const t = useTranslations("staff.door");
  const tc = useTranslations("staff.common");

  if (result.status === "not_found") {
    return (
      <ResultPanel tone="bad" title={tc("notFoundTitle")}>
        {code && (
          <p className="mt-2 font-mono text-body-m text-black02">{code}</p>
        )}
        <p className="mt-2 text-body-m text-black02/85">{tc("notFoundBody")}</p>
        <div className="mt-4">
          <NextButton onNext={onNext} />
        </div>
      </ResultPanel>
    );
  }

  const tier = tiers[result.tierId];
  const packBlock = result.pack ? <PackPanel pack={result.pack} /> : null;
  const passLine = (
    <p className="mt-3 flex flex-wrap items-center gap-2">
      <span className="rounded-pill border-2 border-black02 bg-offwhite px-3 py-1 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02">
        {tier?.name ?? result.tierId}
      </span>
      <span className="font-sans text-body-m font-bold text-black02">
        {result.refund === "refunded"
          ? t("refunded")
          : tier?.paid === false
            ? t("freeEntry")
            : tier?.paid
              ? t("paidIncludes")
              : ""}
      </span>
    </p>
  );
  const refundNote =
    result.refund === "pending" ? (
      <p className="mt-3 rounded-md border-2 border-black02 bg-offwhite px-3 py-2 text-body-m text-black02">
        {t("refundPending")}
      </p>
    ) : null;

  if (result.status === "already_checked_in") {
    return (
      <ResultPanel tone="warn" title={t("already")}>
        <p className="mt-2 text-body-l font-bold text-black02">
          {result.attendeeName}
        </p>
        <p className="mt-1 text-body-m text-black02/85">
          {t("alreadyBody", {
            time: clock.time(result.checkedInAt),
            ago: clock.ago(result.checkedInAt, now),
          })}
        </p>
        {passLine}
        {packBlock}
        {refundNote}
        <div className="mt-4">
          <NextButton onNext={onNext} />
        </div>
      </ResultPanel>
    );
  }

  const attention = Boolean(result.refund);
  return (
    <ResultPanel
      tone={attention ? "warn" : "ok"}
      title={attention ? t("checkedInAttention") : t("checkedIn")}
    >
      <p className="mt-2 text-body-l font-bold text-black02">
        {result.attendeeName}
      </p>
      {passLine}
      {packBlock}
      {refundNote}
      <div className="mt-4">
        <NextButton onNext={onNext} />
      </div>
    </ResultPanel>
  );
}

/**
 * What their pack offers (ADR 0091): the volunteer reads it out, and sends
 * the person to the right table. Icon AND words, never colour alone.
 */
function PackPanel({ pack }: { pack: Pack }) {
  const t = useTranslations("staff.door.pack");
  const locale = useLocale() === "en" ? "en" : "fr";
  const row = (on: boolean, label: string) => (
    <li className="flex items-center gap-2 text-body-m font-bold text-black02">
      {on ? (
        <Check size={18} weight="bold" aria-hidden className="shrink-0" />
      ) : (
        <XIcon
          size={18}
          weight="bold"
          aria-hidden
          className="shrink-0 text-black02/60"
        />
      )}
      <span className={on ? "" : "text-black02/70"}>{label}</span>
    </li>
  );
  return (
    <div className="mt-4 rounded-md border-2 border-black02 bg-offwhite px-4 py-3">
      <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
        {t("title")}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {row(true, t("entry"))}
        {row(pack.meal, pack.meal ? t("meal") : t("noMeal"))}
        {row(pack.swag, pack.swag ? t("swag") : t("noSwag"))}
      </ul>
      {pack.swag && pack.items.length > 0 && (
        <p className="mt-2 text-body-m text-black02/85">
          <span className="font-bold">{t("bag")}</span>{" "}
          {pack.items.map((i) => i[locale]).join(" · ")}
        </p>
      )}
      {pack.swag && pack.apparelSize !== undefined && (
        <p className="mt-1 text-body-m text-black02/85">
          {pack.apparelSize
            ? t("size", { size: pack.apparelSize })
            : t("noSize")}
        </p>
      )}
      {pack.meal && pack.perks.length > 0 && (
        <p className="mt-2 text-caption text-black02/70">
          {pack.perks.map((p) => p[locale]).join(" · ")}
        </p>
      )}
      {!pack.meal && pack.reason === "free_pass" && (
        <p className="mt-2 text-caption text-black02/70">{t("freeNote")}</p>
      )}
      {!pack.meal && pack.reason === "refunded" && (
        <p className="mt-2 text-caption text-black02/70">{t("refundedNote")}</p>
      )}
    </div>
  );
}
