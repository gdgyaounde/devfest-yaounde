"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { PreloaderDots } from "@/components/global/PreloaderDots";
import { Link } from "@/i18n/navigation";
import {
  calmDelay,
  calmFade,
  calmIn,
  storyGrow,
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
import { ChoicePicker, OTHER } from "./ChoicePicker";

type Choice = { kind: "preset" | "other"; value: string } | null;

/**
 * The intro, as a timeline (ms from landing). A storybook opening:
 *   "Once upon a time, in Yaoundé…" surfaces word by word,
 *   the years count up from the first edition to this one,
 *   "…a community began to write its story.",
 *   "Now, it's your turn." — and the page opens onto the blank one.
 */
const FIRST_YEAR = 2016;
const LAST_YEAR = 2026;
/**
 * Each line fades OUT fully before the next fades in (IN_DELAY), so two lines
 * are never on screen at once — one sentence at a time, like turning a page.
 */
const IN_DELAY = 900;
const T_YEARS = 2400;
const YEAR_STEP = 150;
const T_COUNT = T_YEARS + IN_DELAY + 200;
const T_LINE2 = T_COUNT + (LAST_YEAR - FIRST_YEAR) * YEAR_STEP + 700;
const T_LINE3 = T_LINE2 + IN_DELAY + 1800;
const T_DONE = T_LINE3 + IN_DELAY + 1700;

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

  // ------------------------------------------------------------- the intro
  const [stage, setStage] = useState<Stage>("line1");
  const [year, setYear] = useState(FIRST_YEAR);
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
      for (let y = FIRST_YEAR + 1; y <= LAST_YEAR; y++) {
        const yy = y;
        at(T_COUNT + (y - FIRST_YEAR) * YEAR_STEP, () => setYear(yy));
      }
      at(T_LINE2, () => setStage("line2"));
      at(T_LINE3, () => setStage("line3"));
      at(T_DONE, () => setStage("done"));
    }
    // Any key or tap skips straight to the page.
    const skip = () => {
      timers.forEach((id) => window.clearTimeout(id));
      setYear(LAST_YEAR);
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
  useEffect(() => {
    if (!intro && state === "writing") textRef.current?.focus();
  }, [intro, state]);

  // ------------------------------------------- the field grows as you write
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [message, intro]);

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

  const words = (text: string, start = 0, step = 160) =>
    text.split(" ").map((w, i) => (
      <span key={i} className={storyWord} style={wordDelay(start + i * step)}>
        {w}
        {" "}
      </span>
    ));

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-quiet
      className="relative flex h-[100svh] flex-col overflow-hidden bg-pastel"
    >
      {/* The gentle dot field: a soft light wandering over a printed page. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <PreloaderDots calm={calm} base={0.05} peak={0.32} />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8">
        <Link
          href="/"
          className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/55 transition-colors hover:text-black02"
        >
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
            className={`${calmFade} font-sans text-[clamp(5rem,18vw,14rem)] font-bold leading-none tabular-nums text-black02`}
          >
            {year}
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
          <p
            data-shown={stage === "line3"}
            style={{
              transitionDelay: stage === "line3" ? `${IN_DELAY}ms` : "0ms",
            }}
            className={`${calmFade} font-sans text-[clamp(2.25rem,6vw,5rem)] font-bold leading-tight text-black02`}
          >
            {stage === "line3" ? words(t("introTurn"), IN_DELAY, 220) : null}
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------- writing */}
      <div
        data-shown={!intro && state !== "sent"}
        aria-hidden={intro || state === "sent"}
        inert={intro || state === "sent"}
        className={`${calmFade} relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-6 sm:px-10`}
      >
        <div className="flex w-full max-w-3xl flex-col">
          <h1 className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/60">
            {t("prompt")}
          </h1>

          {/* The page: a bordered field that grows with the story. */}
          <div
            className="mt-4 cursor-text rounded-lg border-2 border-black02/20 bg-offwhite/60 px-5 py-4 transition-[border-color,box-shadow,background-color] duration-300 focus-within:border-black02 focus-within:bg-offwhite focus-within:shadow-[0_5px_0_0_var(--color-black02)] sm:px-7 sm:py-6"
            onClick={() => textRef.current?.focus()}
          >
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
              className={`${storyGrow} block max-h-[48svh] min-h-[3.2em] w-full resize-none overflow-y-auto border-0 bg-transparent p-0 font-sans ${size} font-bold leading-[1.2] text-black02 caret-primary transition-[font-size] duration-500 placeholder:text-black02/30 focus:outline-none`}
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
