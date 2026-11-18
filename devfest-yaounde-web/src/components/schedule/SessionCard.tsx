"use client";

import { ArrowRight, CaretDown, Clock, MapPin } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { InterestButton } from "./InterestProvider";
import { SessionExtras, isLongText } from "./SessionExtras";
import { SessionMeta } from "./SessionMeta";
import type { Session, Speaker, Sponsor } from "@/data/types";

export interface SessionCardProps {
  session: Session;
  open: boolean;
  onToggle: () => void;
  /** "timeline" adds the tilt/pinned treatment; "list" stays flat and plain. */
  variant?: "timeline" | "list";
  /** Resting tilt in degrees — timeline variant only. */
  tilt?: number;
  /** Show add-to-calendar actions (full /schedule route only). */
  showCalendar?: boolean;
  speakers?: Speaker[];
  /** Sponsors, to show the logos a session names in `partnerIds`. */
  partners?: Sponsor[];
  /**
   * Home teaser: the description is cut to four lines and a "Full details"
   * link to this href follows, so a long abstract never turns the home
   * preview into a wall of text. The whole description lives on /schedule.
   */
  detailsHref?: string;
  /** Opens the full-screen reader on this session (long descriptions). */
  onRead?: () => void;
}

/**
 * One expandable schedule session — PHASE8 fix #2.
 *
 * Shared by the Home preview and the full /schedule route, and by BOTH the
 * timeline and list views, so the expand affordance behaves identically
 * everywhere and switching views never loses it.
 *
 * Accessibility: the whole header is a real `<button>` with `aria-expanded`
 * and `aria-controls`, so it's keyboard-operable, not click-only. The panel
 * is a labelled `region`. Height animates with the grid-template-rows
 * 1fr -> 0fr technique used across the project (animates auto-height without
 * measuring in JS); `motion-reduce` collapses that to instant.
 */
export function SessionCard({
  session,
  open,
  onToggle,
  variant = "timeline",
  tilt = 0,
  showCalendar = false,
  speakers = [],
  partners = [],
  detailsHref,
  onRead,
}: SessionCardProps) {
  const t = useTranslations("home.schedule");
  const locale = useLocale() as "fr" | "en";
  const speakerById = new Map(speakers.map((s) => [s.id, s]));
  const sessionSpeakers = session.speakerIds
    .map((id) => speakerById.get(id))
    .filter((s): s is Speaker => Boolean(s));

  const sessionPartners = (session.partnerIds ?? [])
    .map((id) => partners.find((s) => s.id === id))
    .filter((s): s is Sponsor => Boolean(s));

  const text = session.description[locale] ?? "";
  const long = isLongText(text);

  const isTimeline = variant === "timeline";

  return (
    <div
      className={
        isTimeline
          ? "relative rounded-lg border-2 border-black02 bg-pastel shadow-[0_5px_0_0_var(--color-black02)] transition-transform duration-200 ease-out-devfest hover:-translate-y-1 motion-reduce:transform-none"
          : "relative bg-pastel transition-colors duration-200 hover:bg-primary/30"
      }
      style={isTimeline && tilt ? { rotate: `${tilt}deg` } : undefined}
    >
      {/* Beside the open/close caret, not inside it: a button cannot nest
          in a button. Breaks have nothing to be interested in. */}
      {session.kind !== "break" && (
        <InterestButton
          sessionId={session.id}
          className="absolute right-[4.25rem] top-4 z-10 sm:right-[4.5rem]"
        />
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`session-panel-${session.id}`}
        id={`session-trigger-${session.id}`}
        className="flex w-full items-start gap-4 px-6 py-5 text-left sm:px-7"
      >
        <div className="min-w-0 flex-1 pr-12">
          {/* Format, Online, level, language — the same chips the speaker
              profile shows (SessionMeta). Duration and room only once they
              exist: an unscheduled session (ADR 0073) has neither yet. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <SessionMeta session={session} />
            {session.durationMin !== undefined && (
              <span className="flex items-center gap-1.5 font-mono text-caption text-black02/65">
                <Clock size={14} weight="bold" aria-hidden />
                {t("duration", { min: session.durationMin })}
              </span>
            )}
            {session.room?.[locale] && (
              <span className="flex items-center gap-1.5 font-mono text-caption text-black02/65">
                <MapPin size={14} weight="bold" aria-hidden />
                <span className="sr-only">{t("room")}: </span>
                {session.room[locale]}
              </span>
            )}
          </div>

          <p className="mt-3 font-sans text-heading-m font-bold leading-tight text-black02">
            {session.title[locale]}
          </p>

          {sessionPartners.length > 0 && (
            <ul className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              {sessionPartners.map((p) => (
                <li key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.logoUrl}
                    alt={p.name}
                    className="h-9 w-auto object-contain"
                  />
                </li>
              ))}
            </ul>
          )}

          {sessionSpeakers.length > 0 && (
            <p className="mt-1.5 font-mono text-caption text-black02/70">
              {sessionSpeakers.map((s) => s.name).join(" · ")}
            </p>
          )}
        </div>

        <span
          aria-hidden
          className={`mt-1 shrink-0 rounded-pill border-2 border-black02 p-1.5 transition-transform duration-300 ease-bouncy motion-reduce:transition-none ${
            open ? "rotate-180 bg-primary" : "bg-transparent"
          }`}
        >
          <CaretDown size={18} weight="bold" />
        </span>
        <span className="sr-only">{open ? t("collapse") : t("expand")}</span>
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-400 ease-out-devfest motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            id={`session-panel-${session.id}`}
            role="region"
            aria-labelledby={`session-trigger-${session.id}`}
            className="border-t-2 border-black02/15 px-6 py-5 sm:px-7"
          >
            {/* pre-line: speakers' descriptions carry their own paragraph
                breaks and bullet lines, which a plain <p> would flatten. A
                long one is cut at a fixed height and finished in a
                full-screen reader instead of stretching the card. */}
            <p
              className={`whitespace-pre-line text-body-m leading-relaxed text-black02/85 ${detailsHref ? "line-clamp-4" : long ? "line-clamp-5" : ""}`}
            >
              {session.description[locale]}
            </p>
            {long && !detailsHref && onRead && (
              <button
                type="button"
                tabIndex={open ? undefined : -1}
                onClick={onRead}
                className="mt-3 inline-flex items-center gap-1.5 font-sans text-body-m font-bold text-black02 underline decoration-2 underline-offset-4 transition-colors hover:decoration-primary"
              >
                {t("readMore")}
                <ArrowRight size={16} weight="bold" aria-hidden />
              </button>
            )}
            {detailsHref && (
              <Link
                href={detailsHref}
                tabIndex={open ? undefined : -1}
                className="mt-3 inline-flex items-center gap-1.5 font-sans text-body-m font-bold text-black02 underline decoration-2 underline-offset-4 transition-colors hover:decoration-primary"
              >
                {t("fullDetails")}
                <ArrowRight size={16} weight="bold" aria-hidden />
              </Link>
            )}

            <SessionExtras
              session={session}
              speakers={sessionSpeakers}
              showCalendar={showCalendar}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
