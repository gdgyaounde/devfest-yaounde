"use client";

import { ForkKnife, Gift } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  PerkResult,
  StaffTicketHit,
  StationTier,
} from "@/lib/staff/results";
import type { PerkKind } from "@/lib/staff/rules";
import { normaliseBadgeCode } from "@/lib/tickets/check-in";
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
import { buzz, useQrScanner } from "./use-qr-scanner";

const AUTO_RESUME_MS = 2200;

// ------------------------------------------------- which table this is ---

/*
 * The table's job (meal or swag) is remembered on the phone, so a volunteer
 * who reloads mid-queue does not silently switch to handing out the other
 * perk. Kept in localStorage behind try/catch; the server snapshot is
 * "meal", and a blocked store simply means choosing again after a reload.
 */
const MODE_KEY = "devfest:perk-station";
const modeListeners = new Set<() => void>();
let memoryMode: PerkKind | null = null;

function readMode(): PerkKind {
  if (memoryMode) return memoryMode;
  try {
    const stored = window.localStorage.getItem(MODE_KEY);
    if (stored === "meal" || stored === "swag") return stored;
  } catch {
    // Blocked storage — fall back to the default.
  }
  return "meal";
}

function writeMode(mode: PerkKind) {
  memoryMode = mode;
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Memory still covers this page's life.
  }
  modeListeners.forEach((fn) => fn());
}

function subscribeMode(fn: () => void) {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}

type Selector = { badgeCode: string } | { ticketId: string };

type Outcome =
  | { kind: "result"; result: PerkResult; code: string | null }
  | { kind: "failure"; failure: Failure; selector: Selector }
  | { kind: "not-a-badge" }
  | { kind: "invalid" };

/**
 * The food and swag tables (ADR 0079): scan a paid pass, hand out ONE meal
 * or ONE bag. The server decides what the pass includes; this screen says
 * yes, already, or not included — and, for swag, what goes in the bag and
 * the shirt size.
 */
export function PerkStation({ tiers }: { tiers: Record<string, StationTier> }) {
  const t = useTranslations("staff.perks");
  const tc = useTranslations("staff.common");
  const clock = useClockText();
  const mode = useSyncExternalStore<PerkKind>(
    subscribeMode,
    readMode,
    () => "meal",
  );

  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [served, setServed] = useState(0);
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
    async (selector: Selector, perk: PerkKind): Promise<PerkResult | null> => {
      scannerRef.current?.pause();
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
      handled.current = "badgeCode" in selector ? selector.badgeCode : null;
      setBusy(true);
      const response = await staffRequest<PerkResult>(
        "/api/staff/perks",
        { method: "POST", body: JSON.stringify({ perk, ...selector }) },
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
            detail: `${result.perk === "meal" ? t("meal") : t("swag")} · ${
              result.status === "collected"
                ? t("statusDone")
                : result.status === "already_collected"
                  ? t("statusAgain")
                  : result.status === "not_eligible"
                    ? t("statusNo")
                    : t("statusUnknown")
            }`,
            tone:
              result.status === "collected"
                ? ("ok" as const)
                : result.status === "already_collected"
                  ? ("warn" as const)
                  : ("bad" as const),
            at: new Date(),
          },
          ...rows,
        ].slice(0, 8),
      );
      if (result.status === "collected") setServed((n) => n + 1);
      buzz(
        result.status === "collected"
          ? 70
          : result.status === "already_collected"
            ? [70, 90, 70]
            : 260,
      );
      // A meal is a nod and a plate; a swag bag needs reading (the items,
      // the size), so only meals move on by themselves.
      if (result.status === "collected" && result.perk === "meal") {
        resumeTimer.current = window.setTimeout(next, AUTO_RESUME_MS);
      }
      return result;
    },
    [next, t],
  );

  const scanner = useQrScanner({
    onCode: (code) => void submit({ badgeCode: code }, readMode()),
    onJunk: () => setOutcome((current) => current ?? { kind: "not-a-badge" }),
  });
  useEffect(() => {
    scannerRef.current = scanner;
  }, [scanner]);

  const tierName = (id: string) => tiers[id]?.name ?? id;

  return (
    <StationShell title={t("title")} counter={tc("counter", { count: served })}>
      <fieldset className="rounded-lg border-2 border-black02 bg-offwhite p-2">
        <legend className="sr-only">{t("station")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["meal", "swag"] as const).map((kind) => {
            const Icon = kind === "meal" ? ForkKnife : Gift;
            const active = mode === kind;
            return (
              <label
                key={kind}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 px-3 py-3 font-sans text-body-m font-bold text-black02 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                  active
                    ? "border-black02 bg-primary"
                    : "border-transparent hover:bg-pastel"
                }`}
              >
                <input
                  type="radio"
                  name="perk-mode"
                  value={kind}
                  checked={active}
                  onChange={() => {
                    writeMode(kind);
                    next();
                  }}
                  className="sr-only"
                />
                <Icon size={22} weight={active ? "fill" : "bold"} aria-hidden />
                {kind === "meal" ? t("meal") : t("swag")}
              </label>
            );
          })}
        </div>
      </fieldset>

      <CameraPanel scanner={scanner} busy={busy} paused={outcome !== null} />

      <div aria-live="assertive" aria-atomic="true">
        {busy && <ResultPanel tone="neutral" title={tc("checking")} />}
        {!busy && outcome?.kind === "failure" && (
          <FailurePanel
            failure={outcome.failure}
            onRetry={() => void submit(outcome.selector, mode)}
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
          <PerkResultView
            result={outcome.result}
            code={outcome.code}
            tierName={tierName}
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
          void submit({ badgeCode: code }, mode);
          return true;
        }}
      />

      <TicketSearch
        actionLabel={t("searchAction")}
        doneLabel={t("searchDone")}
        done={(hit) =>
          (mode === "meal" ? hit.mealCollectedAt : hit.swagCollectedAt) !== null
        }
        busy={busy}
        tierName={tierName}
        onPick={async (hit: StaffTicketHit) => {
          const result = await submit({ ticketId: hit.id }, mode);
          if (
            !result ||
            (result.status !== "collected" &&
              result.status !== "already_collected")
          ) {
            return null;
          }
          return mode === "meal"
            ? { mealCollectedAt: result.collectedAt }
            : { swagCollectedAt: result.collectedAt };
        }}
      />

      <RecentList rows={recent} />
    </StationShell>
  );
}

function PerkResultView({
  result,
  code,
  tierName,
  now,
  clock,
  onNext,
}: {
  result: PerkResult;
  code: string | null;
  tierName: (id: string) => string;
  now: Date;
  clock: ReturnType<typeof useClockText>;
  onNext: () => void;
}) {
  const t = useTranslations("staff.perks");
  const tc = useTranslations("staff.common");
  const locale = useLocale() === "en" ? "en" : "fr";
  const next = (
    <div className="mt-4">
      <NextButton onNext={onNext} />
    </div>
  );

  if (result.status === "not_found") {
    return (
      <ResultPanel tone="bad" title={tc("notFoundTitle")}>
        {code && (
          <p className="mt-2 font-mono text-body-m text-black02">{code}</p>
        )}
        <p className="mt-2 text-body-m text-black02/85">{tc("notFoundBody")}</p>
        {next}
      </ResultPanel>
    );
  }

  const who = (
    <>
      <p className="mt-2 text-body-l font-bold text-black02">
        {result.attendeeName}
      </p>
      <p className="mt-2">
        <span className="rounded-pill border-2 border-black02 bg-offwhite px-3 py-1 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02">
          {tierName(result.tierId)}
        </span>
      </p>
    </>
  );

  if (result.status === "not_eligible") {
    return (
      <ResultPanel tone="bad" title={t("notEligible")}>
        {who}
        <p className="mt-3 text-body-m font-bold text-black02">
          {result.reason === "free_pass"
            ? t("reasonFreePass")
            : result.reason === "refunded"
              ? t("reasonRefunded")
              : t("reasonNotInPass")}
        </p>
        {next}
      </ResultPanel>
    );
  }

  if (result.status === "already_collected") {
    return (
      <ResultPanel
        tone="warn"
        title={result.perk === "meal" ? t("alreadyMeal") : t("alreadySwag")}
      >
        {who}
        <p className="mt-2 text-body-m text-black02/85">
          {t("alreadyBody", {
            time: clock.time(result.collectedAt),
            ago: clock.ago(result.collectedAt, now),
          })}
        </p>
        {next}
      </ResultPanel>
    );
  }

  return (
    <ResultPanel
      tone="ok"
      title={result.perk === "meal" ? t("collectedMeal") : t("collectedSwag")}
    >
      {who}
      {result.perk === "swag" && (
        <>
          {"apparelSize" in result && (
            <p className="mt-3 rounded-md border-2 border-black02 bg-offwhite px-3 py-2 font-sans text-body-l font-bold text-black02">
              {result.apparelSize
                ? t("shirtSize", { size: result.apparelSize })
                : t("noSize")}
            </p>
          )}
          {result.items && result.items.length > 0 && (
            <div className="mt-3">
              <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
                {t("bag")}
              </p>
              <ul className="mt-1 list-disc pl-5 text-body-m text-black02">
                {result.items.map((item, i) => (
                  <li key={i}>{item[locale]}</li>
                ))}
              </ul>
            </div>
          )}
          {next}
        </>
      )}
    </ResultPanel>
  );
}
