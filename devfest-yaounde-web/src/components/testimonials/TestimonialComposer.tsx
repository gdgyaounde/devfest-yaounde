"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { DevFestLogo } from "@/components/brand/DevFestLogo";
import { PreloaderDots } from "@/components/global/PreloaderDots";
import { Link } from "@/i18n/navigation";
import {
  calmAppear,
  calmDelay,
  calmFade,
  calmIn,
  storyDraw,
  storyWord,
  wordDelay,
} from "@/lib/motion";
import {
  MESSAGE_MAX,
  MESSAGE_MIN,
  OTHER_MAX,
  TESTIMONIAL_EDITIONS,
  TESTIMONIAL_ROLES,
  cleanMessage,
} from "@/lib/testimonials/rules";
import { useMediaQuery } from "@/lib/use-media-query";
import { useScramble } from "@/lib/use-scramble";
import { ChoicePicker, OTHER } from "./ChoicePicker";
import { IntroCursors } from "./IntroCursors";

type Choice = { kind: "preset" | "other"; value: string } | null;

/**
 * The intro, as a timeline (ms from landing). A storybook opening:
 *   "Once upon a time, in Yaoundé…" surfaces word by word,
 *   the years count up from the first edition to this one,
 *   "…a community grew, one story at a time.",
 *   and the question itself — "What has DevFest Yaoundé meant to you?" —
 *   which then shrinks into its place above the field.
 */
const FIRST_YEAR = 2016;
const LAST_YEAR = 2026;
/**
 * Each line fades OUT fully before the next fades in (IN_DELAY), so two lines
 * are never on screen at once — one sentence at a time, like turning a page.
 */
const IN_DELAY = 900;
const T_YEARS = 2400;
/**
 * The years, as ONE continuous motion (from when their line starts to fade
 * in, + COUNT_START): 2016 → 2026 slow, fast through the middle, slow again,
 * the digits drawing together as they go — and without stopping, pinching
 * tight on the last year and loosening gently back. No phase boundaries: the
 * spacing is a single smooth curve, so nothing breaks or lags between parts.
 */
const COUNT_START = 300;
const YEARS_MS = 4600;
/** Where in YEARS_MS the count lands on the last year (the spacing too). */
const ARRIVE = 0.78;
const T_LINE2 = T_YEARS + IN_DELAY + COUNT_START + YEARS_MS + 450;
const T_LINE3 = T_LINE2 + IN_DELAY + 1500;
const T_DONE = T_LINE3 + IN_DELAY + 1900;
/**
 * The cursors (in IntroCursors order: organiser, volunteer, speaker,
 * attendee). They join one by one through the first half of the story and
 * leave in reverse while the question is on screen — the organiser last.
 */
const CURSOR_IN = [500, 2700, 5000, 7300] as const;
const CURSOR_OUT = [
  T_LINE3 + 1200,
  T_LINE3 + 800,
  T_LINE3 + 400,
  T_LINE3,
] as const;
/** The field never grows past this share of the screen's height… */
const FIELD_MAX = 0.46;
/** …and its type never shrinks below this, in px, to make a story fit. */
const MIN_FONT = 15;
/** How long the prompt takes to shrink into its place above the field. */
const SHRINK_MS = 1500;

type Stage = "line1" | "years" | "line2" | "line3" | "done";

/**
 * Storytime (ADR 0087): one screen, one blank page, one story.
 *
 * A short storybook intro, then a single centred field that grows as you
 * write. Role and edition are optional pills underneath. Sending fades the
 * page out and a thank-you fades in — calm, not celebratory.
 */
export function TestimonialComposer() {
  const t = useTranslations("testimonial");
  const tr = useTranslations("testimonial.roles");
  const locale = useLocale() === "en" ? "en" : "fr";
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const counterId = useId();

  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [roleOther, setRoleOther] = useState("");
  const [edition, setEdition] = useState("");
  const [editionOther, setEditionOther] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"writing" | "sending" | "sent">("writing");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  // ------------------------------------------------------------- the intro
  const [stage, setStage] = useState<Stage>("line1");
  // The year count is driven frame by frame on the element itself (text and
  // letter-spacing), not through state: 60 renders a second for one number.
  const yearRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (stage !== "years") return;
    const el = yearRef.current;
    if (!el) return;
    const set = (year: number, spacing: number, weight = 0) => {
      el.textContent = String(year);
      // Weight as a STROKE in the text's own colour, not font-weight: it
      // can grow smoothly past the font's boldest cut, so 2026 lands heavy.
      el.style.setProperty(
        "-webkit-text-stroke",
        `${(weight * font).toFixed(2)}px currentColor`,
      );
      el.style.letterSpacing = `${spacing}px`;
      // letter-spacing also trails the LAST digit; cancel it so the year
      // stays centred however wide it is spread.
      el.style.marginRight = `${-spacing}px`;
    };
    const font = parseFloat(getComputedStyle(el).fontSize);
    set(FIRST_YEAR, 0);
    // How far apart the digits can start, from the room this screen has.
    const available = Math.min(window.innerWidth - 48, 896);
    const tight = el.getBoundingClientRect().width;
    const widest = Math.max(0, (available - tight) / 4) * 0.92;
    const pinch = 0.075 * font;
    const inOut = (x: number) =>
      x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    // The pinch-and-release: a smooth bump that starts while the count is
    // still settling, rises fast (the squeeze), falls slowly (the release),
    // with zero slope at both ends — so it blends into what comes before
    // and after it instead of starting or stopping.
    const BUMP_FROM = 0.64;
    const bump = (u: number) => {
      if (u <= BUMP_FROM || u >= 1) return 0;
      const v = (u - BUMP_FROM) / (1 - BUMP_FROM);
      return Math.pow(Math.sin(Math.PI * Math.pow(v, 0.5)), 2);
    };
    set(FIRST_YEAR, widest, 0.004);

    const start = performance.now() + IN_DELAY + COUNT_START;
    let frame = 0;
    const tick = (now: number) => {
      const u = (now - start) / YEARS_MS;
      if (u >= 1) {
        set(LAST_YEAR, 0, 0.04);
        return;
      }
      if (u > 0) {
        const e = inOut(Math.min(1, u / ARRIVE));
        set(
          FIRST_YEAR + Math.round(e * (LAST_YEAR - FIRST_YEAR)),
          widest * (1 - e) - pinch * bump(u),
          // Heavier with every year, and heaviest in the pinch.
          0.004 + 0.036 * e + 0.012 * bump(u),
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stage]);
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) =>
      timers.push(window.setTimeout(fn, reduce ? 0 : ms));
    if (reduce) {
      at(0, () => setStage("done"));
    } else {
      at(T_YEARS, () => setStage("years"));
      at(T_LINE2, () => setStage("line2"));
      at(T_LINE3, () => setStage("line3"));
      at(T_DONE, () => setStage("done"));
    }
    // Any key or tap skips straight to the page.
    const skip = () => {
      timers.forEach((id) => window.clearTimeout(id));
      setStage("done");
    };
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, []);
  const intro = stage !== "done";
  const prompt = t("prompt");
  const promptUpper = prompt.toLocaleUpperCase(locale);
  const { ref: promptScrambleRef, start: startScramble } =
    useScramble<HTMLSpanElement>({
      text: promptUpper,
      from: prompt,
      // ~55 frames: done as the prompt lands (SHRINK_MS), not after it.
      stagger: 1,
      churn: 16,
    });
  useEffect(() => {
    if (stage === "done") startScramble();
  }, [stage, startScramble]);
  // Focus once the prompt has settled above the field (SHRINK_MS).
  useEffect(() => {
    if (intro || state !== "writing") return;
    const id = window.setTimeout(
      () => textRef.current?.focus(),
      // After the field has faded in, so the border is seen drawing from
      // its very first stroke, accelerating and then settling.
      calm ? 0 : SHRINK_MS + 500,
    );
    return () => window.clearTimeout(id);
  }, [intro, state, calm]);

  // ----------------------- the last line of the intro IS the prompt (FLIP)
  // During "line3" the prompt sits large in the middle of the screen; on
  // "done" it shrinks and glides into its real place above the field. Its
  // real place is measured untransformed, then the transform is computed
  // from there — so the landing is exact on any screen size.
  const promptRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const centre = () => {
      el.style.transition = "none";
      el.style.transform = "none";
      // Measure the TEXT, not the box — the heading may be wider than its
      // words, and centring the box would leave the words off-centre.
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const scale = Math.min(4.2, (window.innerWidth * 0.86) / r.width);
      el.style.transformOrigin = `${cx - box.left}px ${cy - box.top}px`;
      const dx = window.innerWidth / 2 - cx;
      const dy = window.innerHeight / 2 - cy;
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    };
    if (stage === "done" || reduce) {
      el.style.transition = reduce
        ? "opacity 200ms linear"
        : `transform ${SHRINK_MS}ms var(--ease-in-out-devfest), opacity 900ms var(--ease-out-devfest)`;
      el.style.transform = "none";
      el.style.opacity = state === "sent" ? "0" : "1";
      return;
    }
    centre();
    // Hidden until its turn; then it fades in, after the line before it.
    void el.offsetWidth;
    el.style.transition = `opacity 900ms var(--ease-out-devfest) ${IN_DELAY}ms`;
    el.style.opacity = stage === "line3" ? "1" : "0";
    window.addEventListener("resize", centre);
    return () => window.removeEventListener("resize", centre);
  }, [stage, state]);

  // ------------------------------------------- the field grows as you write
  // Never a scrollbar. The field grows with the story up to FIELD_MAX of the
  // screen; past that, the type steps down until it all fits. Both changes
  // animate: measure with transitions off, put the old values back, then
  // set the new ones so the browser eases from one to the other.
  const lastFit = useRef<{ font: string; height: string } | null>(null);
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const max = window.innerHeight * FIELD_MAX;
    el.style.transition = "none";
    el.style.fontSize = ""; // the preferred size for this length (class)
    el.style.height = "auto";
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollHeight > max && size > MIN_FONT) {
      size = Math.max(MIN_FONT, size * 0.94);
      el.style.fontSize = `${size}px`;
    }
    const next = {
      font: `${size}px`,
      height: `${Math.min(el.scrollHeight, max)}px`,
    };
    const prev = lastFit.current;
    if (prev && !calm) {
      el.style.fontSize = prev.font;
      el.style.height = prev.height;
      void el.offsetHeight; // commit the old values before easing away
      el.style.transition = `height 360ms var(--ease-out-devfest), font-size 420ms var(--ease-out-devfest)`;
    }
    el.style.fontSize = next.font;
    el.style.height = next.height;
    lastFit.current = next;
  }, [message, intro, viewport, calm]);

  const length = cleanMessage(message).length;
  const ready = length >= MESSAGE_MIN && length <= MESSAGE_MAX;
  // Long stories step down a size so they keep fitting, gently.
  const size =
    length > 200
      ? "text-[clamp(1.25rem,2.6vw,2.25rem)]"
      : length > 110
        ? "text-[clamp(1.4rem,3.1vw,2.75rem)]"
        : "text-[clamp(1.6rem,3.6vw,3.25rem)]";

  const choice = (value: string, other: string): Choice =>
    value === ""
      ? null
      : value === OTHER
        ? other.trim()
          ? { kind: "other", value: other.trim() }
          : null
        : { kind: "preset", value };

  async function send() {
    if (!ready || state !== "writing") return;
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          role: choice(role, roleOther),
          edition: choice(edition, editionOther),
          locale,
          website,
        }),
      });
      if (response.ok) {
        setState("sent");
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(
        body.error === "rate_limited"
          ? t("errorRate")
          : body.error === "too_short"
            ? t("errorShort", { min: MESSAGE_MIN })
            : t("errorGeneric"),
      );
    } catch {
      setError(t("errorGeneric"));
    }
    setState("writing");
  }

  function reset() {
    setMessage("");
    setRole("");
    setRoleOther("");
    setEdition("");
    setEditionOther("");
    setError(null);
    setState("writing");
  }

  // A space only BETWEEN words, never after the last: a trailing one would
  // make the line a character wider than its plain-text twin, and the prompt
  // swaps from these spans to plain text mid-flight.
  const words = (text: string, start = 0, step = 160) => {
    const list = text.split(" ");
    return list.map((w, i) => (
      <span key={i} className={storyWord} style={wordDelay(start + i * step)}>
        {w}
        {i < list.length - 1 ? "\u00A0" : null}
      </span>
    ));
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-quiet
      className="relative flex h-[100svh] flex-col overflow-hidden bg-pastel"
    >
      {/* The gentle dot field: a soft light wandering over a printed page. */}
      <div
        aria-hidden
        className={`${calmAppear} pointer-events-none absolute inset-0`}
      >
        <PreloaderDots calm={calm} base={0.05} peak={0.32} />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/55 transition-colors hover:text-black02"
        >
          <DevFestLogo className="h-4 w-auto shrink-0" />
          DevFest Yaoundé
        </Link>
        {intro && (
          <span className="font-mono text-caption text-black02/45">
            {t("skip")}
          </span>
        )}
      </header>

      {/* ------------------------------------------------------------ intro */}
      <div
        data-shown={intro}
        aria-hidden={!intro}
        className={`${calmFade} pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6 text-center`}
      >
        <div className="relative grid w-full max-w-4xl place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
          <p
            data-shown={stage === "line1"}
            className={`${calmFade} font-sans text-[clamp(2rem,5.5vw,4.5rem)] font-bold leading-tight text-black02`}
          >
            {words(t("introOnce"))}
          </p>
          <p
            data-shown={stage === "years"}
            style={{
              transitionDelay: stage === "years" ? `${IN_DELAY}ms` : "0ms",
            }}
            className={`${calmFade} whitespace-nowrap font-sans text-[clamp(5rem,18vw,14rem)] font-bold leading-none tabular-nums text-black02`}
          >
            <span ref={yearRef} className="inline-block">
              {FIRST_YEAR}
            </span>
          </p>
          <p
            data-shown={stage === "line2"}
            style={{
              transitionDelay: stage === "line2" ? `${IN_DELAY}ms` : "0ms",
            }}
            className={`${calmFade} font-sans text-[clamp(1.75rem,4.5vw,3.75rem)] font-bold leading-tight text-black02`}
          >
            {stage === "line2" || stage === "line3"
              ? words(t("introCommunity"), IN_DELAY, 130)
              : null}
          </p>
        </div>
      </div>

      {/* Coloured cursors, one per role, drifting around the story. */}
      {!calm && (
        <IntroCursors visible={intro} enterAt={CURSOR_IN} exitAt={CURSOR_OUT} />
      )}

      {/* ---------------------------------------------------------- writing */}
      <div className="relative z-30 flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-6 sm:px-10">
        <div className="flex w-full max-w-3xl flex-col">
          <h1
            ref={promptRef}
            style={{ opacity: 0 }}
            aria-label={prompt}
            className="w-fit font-mono text-mono-tag font-bold tracking-wide text-black02/70 will-change-transform"
          >
            {/* Told in the story's own case, then — as it glides into place —
                scrambled into the uppercase label it settles as. Monospace,
                so changing case never changes the width mid-flight. */}
            {stage === "done" ? (
              <span ref={promptScrambleRef} aria-hidden>
                {calm ? promptUpper : prompt}
              </span>
            ) : stage === "line3" ? (
              <span aria-hidden>{words(prompt, IN_DELAY, 140)}</span>
            ) : (
              <span aria-hidden>{prompt}</span>
            )}
          </h1>

          <div
            data-shown={!intro && state !== "sent"}
            aria-hidden={intro || state === "sent"}
            inert={intro || state === "sent"}
            className={calmFade}
            style={{ transitionDelay: !intro ? `${SHRINK_MS - 500}ms` : "0ms" }}
          >
            {/* The page: a bordered field that grows with the story. */}
            <div
              className="relative mt-4 cursor-text rounded-lg px-5 py-4 sm:px-7 sm:py-6"
              onClick={() => textRef.current?.focus()}
            >
              {/* One solid line, drawn around the field from start to finish
                when it takes focus — and kept while it holds a story. */}
              <svg
                aria-hidden
                className="pointer-events-none absolute left-px top-px h-[calc(100%-2px)] w-[calc(100%-2px)] overflow-visible"
              >
                <rect
                  width="100%"
                  height="100%"
                  rx="23"
                  pathLength={1}
                  fill="none"
                  stroke="var(--color-black02)"
                  strokeWidth={2}
                  strokeDasharray="1 1"
                  strokeDashoffset={focused || message.length > 0 ? 0 : 1}
                  className={storyDraw}
                />
              </svg>
              <label htmlFor="testimonial-text" className="sr-only">
                {t("label")}
              </label>
              <textarea
                id="testimonial-text"
                data-story-field
                ref={textRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MESSAGE_MAX + 40}
                rows={2}
                placeholder={t("placeholder")}
                aria-describedby={counterId}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                    void send();
                }}
                className={`block min-h-[3.2em] w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-sans ${size} font-bold leading-[1.2] tracking-[-0.02em] text-black02 caret-primary placeholder:text-black02/30 focus:outline-none`}
              />
              <p
                id={counterId}
                aria-live="polite"
                className={`mt-3 text-right font-mono text-caption transition-colors duration-500 ${
                  length > MESSAGE_MAX
                    ? "text-black02"
                    : length >= MESSAGE_MIN
                      ? "text-black02/55"
                      : "text-black02/35"
                }`}
              >
                {length > MESSAGE_MAX
                  ? t("tooLong", { over: length - MESSAGE_MAX })
                  : t("counter", { count: length, max: MESSAGE_MAX })}
              </p>
            </div>

            {/* Optional details, then send. */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <ChoicePicker
                label={t("roleLabel")}
                placeholder={t("rolePlaceholder")}
                options={TESTIMONIAL_ROLES.map((r) => ({
                  value: r,
                  label: tr(r),
                }))}
                value={role}
                onChange={setRole}
                otherLabel={t("other")}
                otherValue={roleOther}
                onOtherChange={setRoleOther}
                otherMax={OTHER_MAX}
              />
              <ChoicePicker
                label={t("editionLabel")}
                placeholder={t("editionPlaceholder")}
                options={TESTIMONIAL_EDITIONS.map((y) => ({
                  value: y,
                  label: y,
                }))}
                value={edition}
                onChange={setEdition}
                otherLabel={t("other")}
                otherValue={editionOther}
                onOtherChange={setEditionOther}
                otherMax={OTHER_MAX}
              />

              {/* Honeypot: off-screen, unlabelled for people, skipped by tab. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="absolute -left-[9999px] h-px w-px opacity-0"
              />

              <button
                type="button"
                onClick={() => void send()}
                disabled={!ready || state === "sending"}
                className="ml-auto inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-7 py-3 font-sans text-body-l font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-[opacity,transform,box-shadow] duration-500 ease-out-devfest hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none motion-reduce:transform-none"
              >
                {state === "sending" ? t("sending") : t("send")}
                <ArrowRight size={20} weight="bold" aria-hidden />
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-body-m text-black02/80">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- sent */}
      <div
        data-shown={state === "sent"}
        aria-hidden={state !== "sent"}
        inert={state !== "sent"}
        className={`${calmFade} absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center`}
        style={{ transitionDelay: state === "sent" ? "700ms" : "0ms" }}
      >
        <p
          role="status"
          className="max-w-3xl font-sans text-[clamp(2rem,5vw,4rem)] font-bold leading-tight text-black02"
        >
          {state === "sent" ? words(t("thanksTitle"), 700, 140) : ""}
        </p>
        <p
          className={`${state === "sent" ? calmIn : ""} mt-5 max-w-xl text-body-l text-black02/70`}
          style={calmDelay(2200)}
        >
          {t("thanksBody")}
        </p>
        <div
          className={`${state === "sent" ? calmIn : ""} mt-10 flex flex-wrap items-center justify-center gap-4`}
          style={calmDelay(2700)}
        >
          <button
            type="button"
            onClick={reset}
            className="rounded-pill border-2 border-black02 bg-offwhite px-6 py-3 font-sans text-body-m font-bold text-black02 transition-colors hover:bg-halftone/40"
          >
            {t("again")}
          </button>
          <Link
            href="/"
            className="font-sans text-body-m font-bold text-black02/70 underline decoration-2 underline-offset-4 hover:text-black02"
          >
            {t("home")}
          </Link>
        </div>
      </div>
    </main>
  );
}
