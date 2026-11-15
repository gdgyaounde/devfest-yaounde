"use client";

/**
 * The building blocks every day-of station shares (ADR 0079): the page
 * shell, the camera panel, result panels, typed-code entry, the name search,
 * the "recent on this phone" list, and one request helper that turns every
 * HTTP failure into something a volunteer can act on.
 *
 * Built for one hand, one phone and a queue: big targets, an icon AND words
 * on every result (never colour alone), 16px+ inputs so iOS does not zoom.
 */
import {
  ArrowClockwise,
  ArrowLeft,
  Camera,
  CameraSlash,
  CheckCircle,
  Flashlight,
  Keyboard,
  MagnifyingGlass,
  WarningCircle,
  WifiSlash,
  XCircle,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "@/i18n/navigation";
import type { StaffTicketHit } from "@/lib/staff/results";
import { MIN_SEARCH_LENGTH } from "@/lib/staff/rules";
import type { QrScanner } from "./use-qr-scanner";

// ------------------------------------------------------------- requests ---

export type Failure =
  | { kind: "forbidden" }
  | { kind: "rate-limited"; retryAfter: number | null }
  | { kind: "invalid" }
  | { kind: "network" }
  | { kind: "server" };

export type StaffResponse<T> =
  { kind: "ok"; status: number; body: T } | Failure;

/**
 * fetch, with every status a station must handle mapped once. Statuses in
 * `accept` are answers (a 404 "not found" or a 409 "already done" is still
 * an answer); everything else is a Failure.
 */
export async function staffRequest<T>(
  url: string,
  init: RequestInit = {},
  accept: number[] = [200],
): Promise<StaffResponse<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch {
    return { kind: "network" };
  }
  if (accept.includes(response.status)) {
    try {
      return {
        kind: "ok",
        status: response.status,
        body: (await response.json()) as T,
      };
    } catch {
      return { kind: "server" };
    }
  }
  if (response.status === 403) return { kind: "forbidden" };
  if (response.status === 400) return { kind: "invalid" };
  if (response.status === 429) {
    const body = (await response.json().catch(() => ({}))) as {
      retryAfter?: number;
    };
    return { kind: "rate-limited", retryAfter: body.retryAfter ?? null };
  }
  return { kind: "server" };
}

// ---------------------------------------------------------------- time ---

const DOUALA = "Africa/Douala";

export function useClockText() {
  const locale = useLocale();
  const t = useTranslations("staff.common");
  const time = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    timeZone: DOUALA,
    hour: "2-digit",
    minute: "2-digit",
  });
  return {
    time: (iso: string | Date) => {
      const d = typeof iso === "string" ? new Date(iso) : iso;
      return Number.isNaN(d.getTime()) ? "—" : time.format(d);
    },
    ago: (iso: string, now: Date) => {
      const then = Date.parse(iso);
      if (!Number.isFinite(then)) return "";
      const minutes = Math.max(0, Math.round((now.getTime() - then) / 60000));
      if (minutes < 1) return t("agoNow");
      if (minutes < 60) return t("agoMin", { n: minutes });
      return t("agoHours", { h: Math.floor(minutes / 60), m: minutes % 60 });
    },
  };
}

// --------------------------------------------------------------- shell ---

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

export function StationShell({
  title,
  counter,
  children,
}: {
  title: string;
  counter?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("staff.common");
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => {
    document.title = `${title} · DevFest Yaoundé`;
  }, [title]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh bg-pastel px-4 pb-10 pt-4 sm:px-6"
    >
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/volunteer"
            className="inline-flex items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3.5 py-2 font-sans text-caption font-bold text-black02"
          >
            <ArrowLeft size={16} weight="bold" aria-hidden />
            {t("tools")}
          </Link>
          {counter && (
            <p
              className="rounded-pill border-2 border-black02 bg-primary px-3.5 py-2 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02"
              aria-live="polite"
            >
              {counter}
            </p>
          )}
        </header>

        <h1 className="font-sans text-heading-l font-bold leading-tight text-black02">
          {title}
        </h1>

        {!online && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border-2 border-black02 bg-danger-pastel px-4 py-3 text-body-m text-black02"
          >
            <WifiSlash
              size={20}
              weight="bold"
              aria-hidden
              className="mt-0.5 shrink-0"
            />
            {t("offline")}
          </p>
        )}

        {children}
      </div>
    </main>
  );
}

// -------------------------------------------------------------- camera ---

export function CameraPanel({
  scanner,
  busy,
  paused,
}: {
  scanner: QrScanner;
  busy: boolean;
  paused: boolean;
}) {
  const t = useTranslations("staff.common");
  const { videoRef, camera, torch, start, turnOff, toggleTorch } = scanner;
  const live = camera === "live";

  return (
    <section
      aria-label={t("camera")}
      className="relative aspect-square max-h-[46dvh] w-full overflow-hidden rounded-lg border-2 border-black02 bg-black02 shadow-[0_6px_0_0_var(--color-black02)]"
    >
      <video
        ref={videoRef}
        muted
        playsInline
        aria-hidden
        className={`h-full w-full object-cover ${live ? "" : "invisible"}`}
      />

      {live && (
        <>
          {/* The aiming square: four corners, flat borders. */}
          <div aria-hidden className="pointer-events-none absolute inset-[18%]">
            <span className="absolute left-0 top-0 h-1/4 w-1/4 rounded-tl-lg border-l-4 border-t-4 border-primary" />
            <span className="absolute right-0 top-0 h-1/4 w-1/4 rounded-tr-lg border-r-4 border-t-4 border-primary" />
            <span className="absolute bottom-0 left-0 h-1/4 w-1/4 rounded-bl-lg border-b-4 border-l-4 border-primary" />
            <span className="absolute bottom-0 right-0 h-1/4 w-1/4 rounded-br-lg border-b-4 border-r-4 border-primary" />
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
            <span className="rounded-pill bg-black02/75 px-3 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-offwhite">
              {busy ? t("checking") : paused ? t("paused") : t("looking")}
            </span>
            <span className="flex gap-2">
              {torch.supported && (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  aria-pressed={torch.on}
                  aria-label={torch.on ? t("torchOff") : t("torchOn")}
                  className={`flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 text-black02 ${
                    torch.on ? "bg-primary" : "bg-offwhite"
                  }`}
                >
                  <Flashlight
                    size={20}
                    weight={torch.on ? "fill" : "bold"}
                    aria-hidden
                  />
                </button>
              )}
              <button
                type="button"
                onClick={turnOff}
                aria-label={t("cameraOff")}
                className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 bg-offwhite text-black02"
              >
                <CameraSlash size={20} weight="bold" aria-hidden />
              </button>
            </span>
          </div>
        </>
      )}

      {!live && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-offwhite">
          <Camera size={48} weight="duotone" aria-hidden />
          <p className="text-body-m text-offwhite/85">
            {camera === "denied"
              ? t("cameraDenied")
              : camera === "unavailable"
                ? t("cameraUnavailable")
                : camera === "failed"
                  ? t("cameraFailed")
                  : t("cameraIdle")}
          </p>
          {camera !== "unavailable" && (
            <button
              type="button"
              onClick={() => void start()}
              disabled={camera === "starting"}
              className="inline-flex items-center gap-2 rounded-pill border-2 border-offwhite bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 disabled:opacity-60"
            >
              <Camera size={20} weight="bold" aria-hidden />
              {camera === "starting"
                ? t("starting")
                : camera === "off"
                  ? t("startCamera")
                  : t("tryAgain")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------- results ---

const TONES = {
  ok: "bg-success-pastel",
  warn: "bg-primary",
  bad: "bg-danger-pastel",
  neutral: "bg-offwhite",
} as const;

export type Tone = keyof typeof TONES;

export const ACTION =
  "inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_3px_0_0_var(--color-black02)] active:translate-y-0.5 active:shadow-none disabled:opacity-50 motion-reduce:transform-none";

export function ResultPanel({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
}) {
  const Icon =
    tone === "ok"
      ? CheckCircle
      : tone === "warn"
        ? WarningCircle
        : tone === "bad"
          ? XCircle
          : ArrowClockwise;
  return (
    <div
      className={`rounded-lg border-2 border-black02 p-5 shadow-[0_6px_0_0_var(--color-black02)] ${TONES[tone]}`}
    >
      <p className="flex items-center gap-3 font-sans text-heading-m font-bold leading-tight text-black02">
        <Icon
          size={32}
          weight={tone === "neutral" ? "bold" : "fill"}
          aria-hidden
          className={`shrink-0 ${tone === "neutral" ? "animate-spin motion-reduce:animate-none" : ""}`}
        />
        {title}
      </p>
      {children}
    </div>
  );
}

export function NextButton({ onNext }: { onNext: () => void }) {
  const t = useTranslations("staff.common");
  return (
    <button type="button" onClick={onNext} className={ACTION}>
      {t("scanNext")}
    </button>
  );
}

/** Everything that is not an answer: one panel per failure kind. */
export function FailurePanel({
  failure,
  onRetry,
  onNext,
}: {
  failure: Failure | { kind: "not-a-badge" };
  onRetry?: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("staff.common");
  const retry = onRetry && (
    <button type="button" onClick={onRetry} className={ACTION}>
      <ArrowClockwise size={18} weight="bold" aria-hidden />
      {t("retry")}
    </button>
  );
  const actions = (
    <div className="mt-4 flex flex-wrap gap-2">
      {retry}
      <NextButton onNext={onNext} />
    </div>
  );

  switch (failure.kind) {
    case "not-a-badge":
      return (
        <ResultPanel tone="warn" title={t("notBadgeTitle")}>
          <p className="mt-2 text-body-m text-black02/85">
            {t("notBadgeBody")}
          </p>
          <div className="mt-4">
            <NextButton onNext={onNext} />
          </div>
        </ResultPanel>
      );
    case "invalid":
      return (
        <ResultPanel tone="bad" title={t("invalidTitle")}>
          <p className="mt-2 text-body-m text-black02/85">{t("invalidBody")}</p>
          <div className="mt-4">
            <NextButton onNext={onNext} />
          </div>
        </ResultPanel>
      );
    case "forbidden":
      return (
        <ResultPanel tone="bad" title={t("forbiddenTitle")}>
          <p className="mt-2 text-body-m text-black02/85">
            {t("forbiddenBody")}
          </p>
          <div className="mt-4">
            <Link href="/account" className={ACTION}>
              {t("signIn")}
            </Link>
          </div>
        </ResultPanel>
      );
    case "rate-limited":
      return (
        <ResultPanel tone="bad" title={t("rateTitle")}>
          <p className="mt-2 text-body-m text-black02/85">
            {failure.retryAfter
              ? t("rateWait", { seconds: failure.retryAfter })
              : t("rateWaitShort")}
          </p>
          {actions}
        </ResultPanel>
      );
    case "network":
      return (
        <ResultPanel tone="bad" title={t("networkTitle")}>
          <p className="mt-2 text-body-m text-black02/85">{t("networkBody")}</p>
          {actions}
        </ResultPanel>
      );
    case "server":
      return (
        <ResultPanel tone="bad" title={t("serverTitle")}>
          <p className="mt-2 text-body-m text-black02/85">{t("serverBody")}</p>
          {actions}
        </ResultPanel>
      );
  }
}

// ---------------------------------------------------------- code entry ---

const INPUT =
  "min-w-0 flex-1 rounded-md border-2 border-black02 bg-white px-3 py-2.5 text-body-m text-black02 placeholder:text-black02/40";
const SUBMIT =
  "shrink-0 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_3px_0_0_var(--color-black02)] active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none motion-reduce:transform-none";

export function CodeEntry({
  submitLabel,
  busy,
  onSubmit,
  inputRef,
}: {
  submitLabel: string;
  busy: boolean;
  /** Return true to clear the field. */
  onSubmit: (typed: string) => boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const t = useTranslations("staff.common");
  const [typed, setTyped] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || typed.trim() === "") return;
    if (onSubmit(typed)) setTyped("");
  };
  return (
    <form
      onSubmit={submit}
      className="rounded-lg border-2 border-black02 bg-offwhite p-4"
    >
      <label
        htmlFor="badge-code"
        className="flex items-center gap-2 font-sans text-body-m font-bold text-black02"
      >
        <Keyboard size={20} weight="bold" aria-hidden />
        {t("typeTitle")}
      </label>
      <p id="badge-code-hint" className="mt-1 text-caption text-black02/70">
        {t("typeHint")}
      </p>
      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          id="badge-code"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-describedby="badge-code-hint"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="DFY-XXXXX-XXXXX"
          className={`${INPUT} font-mono uppercase`}
        />
        <button
          type="submit"
          disabled={busy || typed.trim() === ""}
          className={SUBMIT}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// --------------------------------------------------------- name search ---

/**
 * "No code? Find them by name." Searches `/api/staff/tickets` on submit (not
 * per keystroke — every search is rate-limited and audited), then offers one
 * action per result. `done(hit)` says whether that action is already spent
 * for the row (checked in, meal taken…), so the row says so instead.
 * `onPick` resolves to a patch for the picked row (e.g. its new
 * `checkedInAt`), so the list reflects the action without searching again.
 */
export function TicketSearch({
  actionLabel,
  doneLabel,
  done,
  busy,
  tierName,
  onPick,
}: {
  actionLabel: string;
  doneLabel: string;
  done: (hit: StaffTicketHit) => boolean;
  busy: boolean;
  tierName: (tierId: string) => string;
  onPick: (hit: StaffTicketHit) => Promise<Partial<StaffTicketHit> | null>;
}) {
  const t = useTranslations("staff.common");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "hits"; hits: StaffTicketHit[]; for: string }
    | { kind: "failed"; failure: Failure }
  >({ kind: "idle" });

  async function run(q: string) {
    setState({ kind: "loading" });
    const result = await staffRequest<{ hits: StaffTicketHit[] }>(
      `/api/staff/tickets?q=${encodeURIComponent(q)}`,
    );
    setState(
      result.kind === "ok"
        ? { kind: "hits", hits: result.body.hits, for: q }
        : { kind: "failed", failure: result },
    );
  }

  async function pick(hit: StaffTicketHit) {
    const patch = await onPick(hit);
    if (!patch) return;
    setState((current) =>
      current.kind === "hits"
        ? {
            ...current,
            hits: current.hits.map((h) =>
              h.id === hit.id ? { ...h, ...patch } : h,
            ),
          }
        : current,
    );
  }

  const tooShort = query.replace(/[\s'.-]/g, "").length < MIN_SEARCH_LENGTH;

  return (
    <section className="rounded-lg border-2 border-black02 bg-offwhite p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!tooShort) void run(query.trim());
        }}
      >
        <label
          htmlFor="ticket-search"
          className="flex items-center gap-2 font-sans text-body-m font-bold text-black02"
        >
          <MagnifyingGlass size={20} weight="bold" aria-hidden />
          {t("searchTitle")}
        </label>
        <p
          id="ticket-search-hint"
          className="mt-1 text-caption text-black02/70"
        >
          {t("searchHint")}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            id="ticket-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby="ticket-search-hint"
            autoComplete="off"
            enterKeyHint="search"
            placeholder={t("searchLabel")}
            className={INPUT}
          />
          <button type="submit" disabled={tooShort} className={SUBMIT}>
            <MagnifyingGlass
              size={20}
              weight="bold"
              aria-label={t("searchTitle")}
            />
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mt-3">
        {state.kind === "loading" && (
          <p className="text-body-m text-black02/70">{t("searching")}</p>
        )}
        {state.kind === "failed" && (
          <p className="text-body-m text-danger-ink">
            {state.failure.kind === "forbidden"
              ? t("forbiddenTitle")
              : state.failure.kind === "rate-limited"
                ? t("rateWaitShort")
                : t("searchFailed")}
          </p>
        )}
        {state.kind === "hits" && state.hits.length === 0 && (
          <p className="text-body-m text-black02/70">{t("searchEmpty")}</p>
        )}
        {state.kind === "hits" && state.hits.length > 0 && (
          <ul className="flex flex-col divide-y-2 divide-black02/10">
            {state.hits.map((hit) => {
              const spent = done(hit);
              return (
                <li
                  key={hit.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-m font-bold text-black02">
                      {hit.name}
                    </span>
                    <span className="block font-mono text-caption uppercase text-black02/65">
                      {tierName(hit.tierId)}
                    </span>
                  </span>
                  {spent ? (
                    <span className="shrink-0 font-sans text-caption font-bold text-black02/70">
                      {doneLabel}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void pick(hit)}
                      className={`${ACTION} shrink-0 bg-primary px-4 py-2`}
                    >
                      {actionLabel}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// -------------------------------------------------------------- recent ---

export interface RecentRow {
  id: number;
  label: string;
  detail: string;
  tone: "ok" | "warn" | "bad";
  at: Date;
}

export function RecentList({ rows }: { rows: RecentRow[] }) {
  const t = useTranslations("staff.common");
  const clock = useClockText();
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="recent-heading">
      <h2
        id="recent-heading"
        className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70"
      >
        {t("recent")}
      </h2>
      <ul className="mt-2 flex flex-col divide-y-2 divide-black02/10 rounded-lg border-2 border-black02 bg-offwhite">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
            {row.tone === "ok" ? (
              <CheckCircle
                size={20}
                weight="fill"
                aria-hidden
                className="shrink-0 text-success-ink"
              />
            ) : row.tone === "warn" ? (
              <WarningCircle
                size={20}
                weight="fill"
                aria-hidden
                className="shrink-0 text-black02"
              />
            ) : (
              <XCircle
                size={20}
                weight="fill"
                aria-hidden
                className="shrink-0 text-danger-ink"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-m font-bold text-black02">
                {row.label}
              </span>
              <span className="block text-caption text-black02/65">
                {row.detail}
              </span>
            </span>
            <time
              dateTime={row.at.toISOString()}
              className="shrink-0 font-mono text-caption text-black02/65"
            >
              {clock.time(row.at)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
