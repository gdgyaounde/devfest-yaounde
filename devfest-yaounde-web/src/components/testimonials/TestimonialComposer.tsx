"use client";

import { ArrowRight, CaretDown } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { calmBreathe, calmDelay, calmFade, calmIn } from "@/lib/motion";
import {
  MESSAGE_MAX,
  MESSAGE_MIN,
  OTHER_MAX,
  TESTIMONIAL_EDITIONS,
  TESTIMONIAL_ROLES,
  cleanMessage,
} from "@/lib/testimonials/rules";

const OTHER = "__other";

type Choice = { kind: "preset" | "other"; value: string } | null;

/**
 * The testimonial page (ADR 0087): one screen, one sentence.
 *
 * Tap anywhere and the cursor is in the text. Role and edition sit quietly
 * at the bottom, both optional, both with an "Other" that turns into a small
 * field. Sending fades the page out slowly and a thank-you fades in — calm,
 * not celebratory: the point is the story, not the button.
 */
export function TestimonialComposer() {
  const t = useTranslations("testimonial");
  const tr = useTranslations("testimonial.roles");
  const locale = useLocale() === "en" ? "en" : "fr";
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
  // The welcome: a greeting that fades in, holds, and gives way to the page.
  // Any key or tap skips it; under reduced motion it never shows.
  const [welcome, setWelcome] = useState(true);
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => setWelcome(false), calm ? 0 : 2600);
    const skip = () => setWelcome(false);
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, []);
  useEffect(() => {
    if (!welcome && state === "writing") textRef.current?.focus();
  }, [welcome, state]);

  const length = cleanMessage(message).length;
  const ready = length >= MESSAGE_MIN && length <= MESSAGE_MAX;

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
    window.setTimeout(() => textRef.current?.focus(), 50);
  }

  const select =
    "appearance-none rounded-pill border-2 border-black02/25 bg-transparent py-2 pl-4 pr-9 font-sans text-body-m text-black02 transition-colors duration-300 hover:border-black02/60 focus:border-black02 focus:outline-none";
  const other =
    "w-40 rounded-pill border-2 border-black02/25 bg-transparent px-4 py-2 font-sans text-body-m text-black02 placeholder:text-black02/40 focus:border-black02 focus:outline-none";

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-quiet
      className="relative flex h-[100svh] flex-col overflow-hidden bg-pastel"
    >
      {/* One large, flat, slowly swelling shape: the only decoration. */}
      <span
        aria-hidden
        className={`${calmBreathe} pointer-events-none absolute left-1/2 top-1/2 h-[70vmax] w-[70vmax] rounded-full bg-halftone/25`}
      />

      <header
        className={`${calmIn} relative z-10 flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8`}
      >
        <Link
          href="/"
          className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/55 transition-colors hover:text-black02"
        >
          DevFest Yaoundé
        </Link>
      </header>

      {/* ---------------------------------------------------------- welcome */}
      <div
        data-shown={welcome}
        aria-hidden={!welcome}
        className={`${calmFade} pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center`}
      >
        <p
          className={`${calmIn} font-sans text-[clamp(2.25rem,6vw,5rem)] font-bold leading-tight text-black02`}
          style={calmDelay(150)}
        >
          {t("welcomeTitle")}
        </p>
        <p
          className={`${calmIn} mt-4 text-body-l text-black02/70`}
          style={calmDelay(700)}
        >
          {t("welcomeBody")}
        </p>
      </div>

      {/* ---------------------------------------------------------- writing */}
      <div
        data-shown={!welcome && state !== "sent"}
        aria-hidden={welcome || state === "sent"}
        inert={welcome || state === "sent"}
        className={`${calmFade} relative z-10 flex min-h-0 flex-1 flex-col`}
      >
        {/* Tap anywhere in this area and you are typing. */}
        <div
          className="flex min-h-0 flex-1 cursor-text flex-col px-6 pt-[8svh] sm:justify-center sm:px-10 sm:pt-0 lg:px-24"
          onClick={() => textRef.current?.focus()}
        >
          <h1
            className={`${calmIn} font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/60`}
            style={calmDelay(250)}
          >
            {t("prompt")}
          </h1>
          <label htmlFor="testimonial-text" className="sr-only">
            {t("label")}
          </label>
          <textarea
            id="testimonial-text"
            ref={textRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MESSAGE_MAX + 40}
            rows={4}
            placeholder={t("placeholder")}
            aria-describedby={counterId}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            className={`${calmIn} mt-5 min-h-0 w-full flex-1 resize-none border-0 bg-transparent p-0 font-sans text-[clamp(1.5rem,4.2vw,3.75rem)] sm:flex-none font-bold leading-[1.15] text-black02 caret-primary placeholder:text-black02/30 focus:outline-none`}
            style={calmDelay(500)}
          />
          <p
            id={counterId}
            aria-live="polite"
            className={`mt-4 font-mono text-caption transition-colors duration-500 ${
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
        <div
          className={`${calmIn} flex flex-wrap items-end gap-3 px-6 pb-6 sm:px-10 sm:pb-8 lg:px-24`}
          style={calmDelay(900)}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative">
              <label htmlFor="testimonial-role" className="sr-only">
                {t("roleLabel")}
              </label>
              <select
                id="testimonial-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={select}
              >
                <option value="">{t("rolePlaceholder")}</option>
                {TESTIMONIAL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {tr(r)}
                  </option>
                ))}
                <option value={OTHER}>{t("other")}</option>
              </select>
              <CaretDown
                size={14}
                weight="bold"
                aria-hidden
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-black02/60"
              />
            </span>
            {role === OTHER && (
              <input
                aria-label={t("roleOtherLabel")}
                value={roleOther}
                maxLength={OTHER_MAX}
                onChange={(e) => setRoleOther(e.target.value)}
                placeholder={t("roleOtherPlaceholder")}
                className={`${calmIn} ${other}`}
                autoFocus
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="relative">
              <label htmlFor="testimonial-edition" className="sr-only">
                {t("editionLabel")}
              </label>
              <select
                id="testimonial-edition"
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
                className={select}
              >
                <option value="">{t("editionPlaceholder")}</option>
                {TESTIMONIAL_EDITIONS.map((y) => (
                  <option key={y} value={y}>
                    DevFest {y}
                  </option>
                ))}
                <option value={OTHER}>{t("other")}</option>
              </select>
              <CaretDown
                size={14}
                weight="bold"
                aria-hidden
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-black02/60"
              />
            </span>
            {edition === OTHER && (
              <input
                aria-label={t("editionOtherLabel")}
                value={editionOther}
                maxLength={OTHER_MAX}
                onChange={(e) => setEditionOther(e.target.value)}
                placeholder={t("editionOtherPlaceholder")}
                className={`${calmIn} ${other}`}
                autoFocus
              />
            )}
          </div>

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

          <div className="ml-auto flex flex-col items-end gap-2">
            {error && (
              <p role="alert" className="text-body-m text-black02/80">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void send()}
              disabled={!ready || state === "sending"}
              className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-7 py-3.5 font-sans text-body-l font-bold text-black02 transition-[opacity,transform] duration-500 ease-out-devfest hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-30 motion-reduce:transform-none"
            >
              {state === "sending" ? t("sending") : t("send")}
              <ArrowRight size={20} weight="bold" aria-hidden />
            </button>
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
          {state === "sent" ? t("thanksTitle") : ""}
        </p>
        <p className="mt-5 max-w-xl text-body-l text-black02/70">
          {t("thanksBody")}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={reset}
            className="rounded-pill border-2 border-black02 px-6 py-3 font-sans text-body-m font-bold text-black02 transition-colors hover:bg-halftone/40"
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
