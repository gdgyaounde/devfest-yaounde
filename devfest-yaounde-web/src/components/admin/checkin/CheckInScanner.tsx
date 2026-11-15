"use client";

import {
  ArrowClockwise,
  ArrowLeft,
  Camera,
  CameraSlash,
  CheckCircle,
  Flashlight,
  Keyboard,
  WarningCircle,
  WifiSlash,
  XCircle,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { Link } from "@/i18n/navigation";
import { normaliseBadgeCode, type CheckInResult } from "@/lib/tickets/check-in";

/**
 * The door scanner (ADR 0078) — `/admin/check-in`.
 *
 * Built for one hand, one phone, a queue, and bad Wi-Fi:
 *
 *   - the camera reads the badge QR with the browser's own `BarcodeDetector`
 *     where it exists (Chrome on Android), and with `jsQR` — loaded only
 *     then — where it does not (Safari on iPhone);
 *   - typing the code is always there, for the cracked screen, the dead
 *     battery, the camera that will not focus;
 *   - every result is a big panel with an icon AND words, never colour alone;
 *   - a scan PAUSES the camera, so the same badge held up for two seconds is
 *     one check-in, not one success followed by "already checked in". A clean
 *     success resumes by itself; anything that needs a human decision waits
 *     for "Scan next".
 *
 * There is no offline queue on purpose: a queued scan admits someone nobody
 * has verified, and two phones would both admit the same badge. When the
 * network is down the screen says so, keeps the code for a retry, and the
 * printed list from Tickets → Export is the fallback.
 *
 * English only, like the rest of the dashboard.
 */

type TierInfo = { name: string; paid: boolean };

type Outcome =
  | { kind: "result"; code: string; result: CheckInResult }
  | { kind: "invalid"; input: string }
  | { kind: "not-a-badge" }
  | { kind: "forbidden" }
  | { kind: "rate-limited"; retryAfter: number | null; code: string }
  | { kind: "network"; code: string }
  | { kind: "server"; code: string };

type Recent = {
  id: number;
  code: string;
  name: string;
  status: "in" | "again" | "unknown";
  at: Date;
};

type CameraState =
  "off" | "starting" | "live" | "denied" | "unavailable" | "failed";

/** How long a clean success stays up before the camera looks again. */
const AUTO_RESUME_MS = 2200;
/** The badge just handled is ignored this long after resuming. */
const SAME_CODE_COOLDOWN_MS = 8000;
/** Frame sampling interval while looking for a code. */
const SCAN_INTERVAL_MS = 180;

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Douala",
  hour: "2-digit",
  minute: "2-digit",
});

// --------------------------------------------------------------- detection ---

type Detect = (video: HTMLVideoElement) => Promise<string | null>;

/** The bit of the Shape Detection API used here; not in TS's lib.dom yet. */
type BarcodeDetectorCtor = {
  new (opts: { formats: string[] }): {
    detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
  };
  getSupportedFormats(): Promise<string[]>;
};

async function createDetector(): Promise<Detect> {
  const Native = (
    window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
  ).BarcodeDetector;
  if (Native) {
    try {
      const formats = await Native.getSupportedFormats();
      if (formats.includes("qr_code")) {
        const detector = new Native({ formats: ["qr_code"] });
        return async (video) =>
          (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // Present but broken (it happens on some desktop builds) — fall back.
    }
  }

  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!ctx || !w || !h) return null;
    // A badge fills most of the frame; 640px is plenty and keeps an older
    // phone from cooking itself decoding full-resolution frames.
    const scale = Math.min(1, 640 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return (
      jsQR(image.data, image.width, image.height, {
        inversionAttempts: "dontInvert",
      })?.data ?? null
    );
  };
}

// ------------------------------------------------------------------ online ---

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not every browser has it, and none of this depends on it.
  }
}

function minutesAgo(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - then.getTime()) / 60000),
  );
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min ago`;
}

// --------------------------------------------------------------- component ---

export function CheckInScanner({ tiers }: { tiers: Record<string, TierInfo> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectRef = useRef<Detect | null>(null);
  const loopRef = useRef<number | null>(null);
  const resumeRef = useRef<number | null>(null);
  /** True while a result is on screen or a request is in flight. */
  const pausedRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; until: number } | null>(null);
  const lastJunkRef = useRef<{ raw: string; until: number } | null>(null);
  const wantCameraRef = useRef(false);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  /** The scan loop schedules its next frame through this, not by name. */
  const tickRef = useRef<() => void>(() => undefined);

  const [camera, setCamera] = useState<CameraState>("off");
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({
    supported: false,
    on: false,
  });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [admitted, setAdmitted] = useState(0);
  const [typed, setTyped] = useState("");

  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => {
    document.title = "Check-in · DevFest Yaoundé";
  }, []);

  // ---------------------------------------------------------- the request ---

  const resume = useCallback(() => {
    if (resumeRef.current) window.clearTimeout(resumeRef.current);
    resumeRef.current = null;
    pausedRef.current = false;
    setOutcome(null);
  }, []);

  const submit = useCallback(
    async (code: string) => {
      pausedRef.current = true;
      if (resumeRef.current) window.clearTimeout(resumeRef.current);
      setBusy(true);
      lastCodeRef.current = { code, until: Infinity };

      let next: Outcome;
      try {
        const response = await fetch("/api/check-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ badgeCode: code }),
          cache: "no-store",
        });
        if (response.status === 200 || response.status === 404) {
          const result = (await response.json()) as CheckInResult;
          next = { kind: "result", code, result };
        } else if (response.status === 403) {
          next = { kind: "forbidden" };
        } else if (response.status === 429) {
          const body = (await response.json().catch(() => ({}))) as {
            retryAfter?: number;
          };
          next = {
            kind: "rate-limited",
            retryAfter: body.retryAfter ?? null,
            code,
          };
        } else if (response.status === 400) {
          next = { kind: "invalid", input: code };
        } else {
          next = { kind: "server", code };
        }
      } catch {
        next = { kind: "network", code };
      }

      setBusy(false);
      setOutcome(next);

      if (next.kind === "result") {
        const { result } = next;
        const status =
          result.status === "checked_in"
            ? "in"
            : result.status === "already_checked_in"
              ? "again"
              : "unknown";
        setRecent((list) =>
          [
            {
              id: nextId.current++,
              code,
              name: result.status === "not_found" ? "" : result.attendeeName,
              status,
              at: new Date(),
            } satisfies Recent,
            ...list,
          ].slice(0, 8),
        );
        if (result.status === "checked_in") setAdmitted((n) => n + 1);

        const clean = result.status === "checked_in" && !result.refund;
        buzz(clean ? 70 : result.status === "not_found" ? 260 : [70, 90, 70]);
        if (clean) {
          resumeRef.current = window.setTimeout(() => {
            lastCodeRef.current = {
              code,
              until: Date.now() + SAME_CODE_COOLDOWN_MS,
            };
            resume();
          }, AUTO_RESUME_MS);
        }
      } else {
        buzz(260);
      }
    },
    [resume],
  );

  /** "Scan next" — and the same badge stays ignored for a few seconds. */
  const scanNext = useCallback(() => {
    const last = lastCodeRef.current;
    if (last) {
      lastCodeRef.current = {
        code: last.code,
        until: Date.now() + SAME_CODE_COOLDOWN_MS,
      };
    }
    resume();
    if (!wantCameraRef.current) inputRef.current?.focus();
  }, [resume]);

  // --------------------------------------------------------------- camera ---

  const stopCamera = useCallback(() => {
    if (loopRef.current) window.clearTimeout(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorch({ supported: false, on: false });
  }, []);

  const tick = useCallback(async () => {
    const video = videoRef.current;
    const detect = detectRef.current;
    if (video && detect && !pausedRef.current && video.readyState >= 2) {
      try {
        const raw = await detect(video);
        // Re-checked after the await: the camera may have been switched off
        // while this frame was decoding.
        if (raw && !pausedRef.current && streamRef.current) {
          const now = Date.now();
          const code = normaliseBadgeCode(raw);
          const last = lastCodeRef.current;
          if (code && !(last && last.code === code && now < last.until)) {
            void submit(code);
          } else if (!code) {
            // A QR that is not a badge (a URL, a Wi-Fi code): say so once,
            // not on every frame it stays in view.
            const junk = lastJunkRef.current;
            if (!(junk && junk.raw === raw && now < junk.until)) {
              lastJunkRef.current = { raw, until: now + 4000 };
              setOutcome((current) =>
                current && current.kind !== "not-a-badge"
                  ? current
                  : { kind: "not-a-badge" },
              );
            }
          }
        }
      } catch {
        // A frame that failed to decode is just a frame; try the next one.
      }
    }
    if (streamRef.current) {
      loopRef.current = window.setTimeout(
        () => tickRef.current(),
        SCAN_INTERVAL_MS,
      );
    }
  }, [submit]);

  useEffect(() => {
    tickRef.current = () => void tick();
  }, [tick]);

  const startCamera = useCallback(async () => {
    wantCameraRef.current = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      // Turned off (or unmounted) while the permission prompt was up.
      if (!wantCameraRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      detectRef.current ??= await createDetector();

      const [track] = stream.getVideoTracks();
      const caps = (
        track?.getCapabilities as
          (() => MediaTrackCapabilities & { torch?: boolean }) | undefined
      )?.call(track);
      setTorch({ supported: Boolean(caps?.torch), on: false });

      setCamera("live");
      void tick();
    } catch (error) {
      const name = (error as { name?: string })?.name;
      setCamera(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "unavailable"
            : "failed",
      );
      wantCameraRef.current = false;
    }
  }, [tick]);

  const turnCameraOff = useCallback(() => {
    wantCameraRef.current = false;
    stopCamera();
    setCamera("off");
  }, [stopCamera]);

  const toggleTorch = useCallback(async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({
        advanced: [{ torch: on } as MediaTrackConstraintSet],
      });
      setTorch({ supported: true, on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }, [torch.on]);

  /*
   * Start by itself when the camera was already allowed — a volunteer
   * reopening the page mid-queue should not have to tap first. Browsers that
   * cannot answer the permission question (Firefox) get the button.
   */
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === "granted") void startCamera();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [startCamera]);

  /* A locked phone in a pocket should not keep the camera (and battery) on. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (streamRef.current) stopCamera();
      } else if (wantCameraRef.current && !streamRef.current) {
        void startCamera();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [startCamera, stopCamera]);

  useEffect(
    () => () => {
      wantCameraRef.current = false;
      stopCamera();
      if (resumeRef.current) window.clearTimeout(resumeRef.current);
    },
    [stopCamera],
  );

  // --------------------------------------------------------- manual entry ---

  const onManual = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const code = normaliseBadgeCode(typed);
    if (!code) {
      setOutcome({ kind: "invalid", input: typed });
      buzz(260);
      return;
    }
    setTyped("");
    void submit(code);
  };

  // ---------------------------------------------------------------- view ---

  const live = camera === "live";

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh bg-pastel px-4 pb-10 pt-4 sm:px-6"
    >
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/admin?view=tickets"
            className="inline-flex items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3.5 py-2 font-sans text-caption font-bold text-black02"
          >
            <ArrowLeft size={16} weight="bold" aria-hidden />
            Dashboard
          </Link>
          <p
            className="rounded-pill border-2 border-black02 bg-primary px-3.5 py-2 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02"
            aria-live="polite"
          >
            {admitted} in on this phone
          </p>
        </header>

        <h1 className="font-sans text-heading-l font-bold leading-tight text-black02">
          Door check-in
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
            You&apos;re offline — scans can&apos;t be checked. Use the printed
            list until the connection is back.
          </p>
        )}

        {/* ------------------------------------------------------ camera --- */}
        <section
          aria-label="Camera"
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
              {/* The aiming square: four corners, not a full box, so the
                  badge reads through it. Flat borders — no masks. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-[18%]"
              >
                <span className="absolute left-0 top-0 h-1/4 w-1/4 rounded-tl-lg border-l-4 border-t-4 border-primary" />
                <span className="absolute right-0 top-0 h-1/4 w-1/4 rounded-tr-lg border-r-4 border-t-4 border-primary" />
                <span className="absolute bottom-0 left-0 h-1/4 w-1/4 rounded-bl-lg border-b-4 border-l-4 border-primary" />
                <span className="absolute bottom-0 right-0 h-1/4 w-1/4 rounded-br-lg border-b-4 border-r-4 border-primary" />
              </div>
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
                <span className="rounded-pill bg-black02/75 px-3 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-offwhite">
                  {busy
                    ? "Checking…"
                    : outcome
                      ? "Paused"
                      : "Looking for a badge"}
                </span>
                <span className="flex gap-2">
                  {torch.supported && (
                    <button
                      type="button"
                      onClick={() => void toggleTorch()}
                      aria-pressed={torch.on}
                      aria-label={
                        torch.on ? "Turn the light off" : "Turn the light on"
                      }
                      className={`flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 ${
                        torch.on ? "bg-primary" : "bg-offwhite"
                      } text-black02`}
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
                    onClick={turnCameraOff}
                    aria-label="Turn the camera off"
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
                  ? "Camera access was blocked. Allow it in the browser's site settings, or type codes below."
                  : camera === "unavailable"
                    ? "No camera available on this device — type codes below."
                    : camera === "failed"
                      ? "The camera wouldn't start. Try again, or type codes below."
                      : "Point the camera at the QR code on the attendee's ticket."}
              </p>
              {camera !== "unavailable" && (
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  disabled={camera === "starting"}
                  className="inline-flex items-center gap-2 rounded-pill border-2 border-offwhite bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 disabled:opacity-60"
                >
                  <Camera size={20} weight="bold" aria-hidden />
                  {camera === "starting"
                    ? "Starting…"
                    : camera === "off"
                      ? "Start camera"
                      : "Try again"}
                </button>
              )}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------ result --- */}
        <div aria-live="assertive" aria-atomic="true">
          {busy && (
            <ResultPanel
              tone="neutral"
              Icon={ArrowClockwise}
              title="Checking…"
            />
          )}
          {!busy && outcome && (
            <OutcomeView
              outcome={outcome}
              tiers={tiers}
              onNext={scanNext}
              onRetry={(code) => void submit(code)}
            />
          )}
        </div>

        {/* ------------------------------------------------ manual entry --- */}
        <form
          onSubmit={onManual}
          className="rounded-lg border-2 border-black02 bg-offwhite p-4"
        >
          <label
            htmlFor="badge-code"
            className="flex items-center gap-2 font-sans text-body-m font-bold text-black02"
          >
            <Keyboard size={20} weight="bold" aria-hidden />
            Type the code instead
          </label>
          <p id="badge-code-hint" className="mt-1 text-caption text-black02/70">
            It&apos;s printed under the QR: DFY-XXXXX-XXXXX. Case and dashes
            don&apos;t matter.
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
              className="min-w-0 flex-1 rounded-md border-2 border-black02 bg-white px-3 py-2.5 font-mono text-body-m uppercase text-black02 placeholder:text-black02/40"
            />
            <button
              type="submit"
              disabled={busy || typed.trim() === ""}
              className="shrink-0 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_3px_0_0_var(--color-black02)] active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none motion-reduce:transform-none"
            >
              Check in
            </button>
          </div>
        </form>

        {/* ------------------------------------------------------ recent --- */}
        {recent.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2
              id="recent-heading"
              className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70"
            >
              Recent scans on this phone
            </h2>
            <ul className="mt-2 flex flex-col divide-y-2 divide-black02/10 rounded-lg border-2 border-black02 bg-offwhite">
              {recent.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  {row.status === "in" ? (
                    <CheckCircle
                      size={20}
                      weight="fill"
                      aria-hidden
                      className="shrink-0 text-success-ink"
                    />
                  ) : row.status === "again" ? (
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
                      {row.name || row.code}
                    </span>
                    <span className="block text-caption text-black02/65">
                      {row.status === "in"
                        ? "Checked in"
                        : row.status === "again"
                          ? "Already checked in"
                          : "Unknown code"}
                    </span>
                  </span>
                  <time
                    dateTime={row.at.toISOString()}
                    className="shrink-0 font-mono text-caption text-black02/65"
                  >
                    {TIME.format(row.at)}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

// ------------------------------------------------------------- results ---

const TONES = {
  ok: "bg-success-pastel",
  warn: "bg-primary",
  bad: "bg-danger-pastel",
  neutral: "bg-offwhite",
} as const;

function ResultPanel({
  tone,
  Icon,
  title,
  children,
}: {
  tone: keyof typeof TONES;
  Icon: typeof CheckCircle;
  title: string;
  children?: React.ReactNode;
}) {
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

const ACTION =
  "inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_3px_0_0_var(--color-black02)] active:translate-y-0.5 active:shadow-none motion-reduce:transform-none";

function OutcomeView({
  outcome,
  tiers,
  onNext,
  onRetry,
}: {
  outcome: Outcome;
  tiers: Record<string, TierInfo>;
  onNext: () => void;
  onRetry: (code: string) => void;
}) {
  const next = (
    <button type="button" onClick={onNext} className={ACTION}>
      Scan next
    </button>
  );

  switch (outcome.kind) {
    case "result": {
      const { result, code } = outcome;
      if (result.status === "not_found") {
        return (
          <ResultPanel
            tone="bad"
            Icon={XCircle}
            title="No ticket with this code"
          >
            <p className="mt-2 font-mono text-body-m text-black02">{code}</p>
            <p className="mt-2 text-body-m text-black02/85">
              Check the code with them, or look them up in Tickets. Free-pass
              holders who registered on Bevy won&apos;t have a code here.
            </p>
            <div className="mt-4">{next}</div>
          </ResultPanel>
        );
      }
      const tier = tiers[result.tierId];
      const passLine = (
        <p className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-pill border-2 border-black02 bg-offwhite px-3 py-1 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02">
            {tier?.name ?? result.tierId}
          </span>
          <span className="font-sans text-body-m font-bold text-black02">
            {result.refund === "refunded"
              ? "Refunded — entry only, no meal or swag"
              : tier?.paid === false
                ? "Free pass — entry only"
                : tier?.paid
                  ? "Paid pass — meal and swag included"
                  : ""}
          </span>
        </p>
      );
      const refundNote =
        result.refund === "pending" ? (
          <p className="mt-3 rounded-md border-2 border-black02 bg-offwhite px-3 py-2 text-body-m text-black02">
            A refund request is open for this ticket. Let the refunds desk know
            they came in.
          </p>
        ) : null;

      if (result.status === "already_checked_in") {
        const when = new Date(result.checkedInAt);
        return (
          <ResultPanel
            tone="warn"
            Icon={WarningCircle}
            title="Already checked in"
          >
            <p className="mt-2 text-body-l font-bold text-black02">
              {result.attendeeName}
            </p>
            <p className="mt-1 text-body-m text-black02/85">
              First scanned at{" "}
              {Number.isNaN(when.getTime()) ? "—" : TIME.format(when)} (
              {minutesAgo(result.checkedInAt, new Date())}). If this isn&apos;t
              the same person, ask for ID and call an organiser.
            </p>
            {passLine}
            {refundNote}
            <div className="mt-4">{next}</div>
          </ResultPanel>
        );
      }

      const needsAttention = Boolean(result.refund);
      return (
        <ResultPanel
          tone={needsAttention ? "warn" : "ok"}
          Icon={needsAttention ? WarningCircle : CheckCircle}
          title={needsAttention ? "Checked in — read this" : "Checked in"}
        >
          <p className="mt-2 text-body-l font-bold text-black02">
            {result.attendeeName}
          </p>
          {passLine}
          {refundNote}
          {needsAttention && <div className="mt-4">{next}</div>}
        </ResultPanel>
      );
    }
    case "not-a-badge":
      return (
        <ResultPanel
          tone="warn"
          Icon={WarningCircle}
          title="That QR isn't a DevFest ticket"
        >
          <p className="mt-2 text-body-m text-black02/85">
            Ask them to open the ticket in their account or in the receipt
            email.
          </p>
          <div className="mt-4">{next}</div>
        </ResultPanel>
      );
    case "invalid":
      return (
        <ResultPanel tone="bad" Icon={XCircle} title="That's not a ticket code">
          <p className="mt-2 text-body-m text-black02/85">
            Codes look like DFY-XXXXX-XXXXX — ten letters and digits after DFY.
          </p>
          <div className="mt-4">{next}</div>
        </ResultPanel>
      );
    case "forbidden":
      return (
        <ResultPanel tone="bad" Icon={XCircle} title="You're signed out">
          <p className="mt-2 text-body-m text-black02/85">
            Only organisers can check people in. Sign in again, then come back
            to this page.
          </p>
          <div className="mt-4">
            <Link href="/account" className={ACTION}>
              Sign in
            </Link>
          </div>
        </ResultPanel>
      );
    case "rate-limited":
      return (
        <ResultPanel
          tone="bad"
          Icon={WarningCircle}
          title="Too many scans at once"
        >
          <p className="mt-2 text-body-m text-black02/85">
            {outcome.retryAfter
              ? `Wait ${outcome.retryAfter} seconds, then retry.`
              : "Wait a moment, then retry."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRetry(outcome.code)}
              className={ACTION}
            >
              <ArrowClockwise size={18} weight="bold" aria-hidden />
              Retry
            </button>
            {next}
          </div>
        </ResultPanel>
      );
    case "network":
    case "server":
      return (
        <ResultPanel
          tone="bad"
          Icon={WifiSlash}
          title={
            outcome.kind === "network"
              ? "Couldn't reach the server"
              : "Something glitched on our end"
          }
        >
          <p className="mt-2 font-mono text-body-m text-black02">
            {outcome.code}
          </p>
          <p className="mt-2 text-body-m text-black02/85">
            {outcome.kind === "network"
              ? "It may or may not have gone through. Retry — if it then says “already checked in” a moment ago, that was this scan."
              : "Nothing was recorded. Retry, or check them against the printed list."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRetry(outcome.code)}
              className={ACTION}
            >
              <ArrowClockwise size={18} weight="bold" aria-hidden />
              Retry
            </button>
            {next}
          </div>
        </ResultPanel>
      );
  }
}
