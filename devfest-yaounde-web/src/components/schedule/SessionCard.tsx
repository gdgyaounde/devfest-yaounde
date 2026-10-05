"use client";

import {
  CalendarPlus,
  CaretDown,
  Clock,
  Coffee,
  MapPin,
  Microphone,
  Rocket,
  UsersThree,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { Link } from "@/i18n/navigation";
import { useEventDates } from "@/components/global/EventDateProvider";
import { googleCalendarUrl, icsDataUrl } from "@/lib/calendar";
import type { Session, Speaker, SessionKind } from "@/data/types";

export const KIND_ICON: Record<SessionKind, typeof Microphone> = {
  talk: Microphone,
  workshop: Rocket,
  panel: UsersThree,
  break: Coffee,
};

const KIND_LABEL_KEY: Record<SessionKind, string> = {
  talk: "kindTalk",
  workshop: "kindWorkshop",
  panel: "kindPanel",
  break: "kindBreak",
};

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
}: SessionCardProps) {
  const eventDate = useEventDates()[0];
  const t = useTranslations("home.schedule");
  const locale = useLocale() as "fr" | "en";
  const Icon = KIND_ICON[session.kind];
  const speakerById = new Map(speakers.map((s) => [s.id, s]));
  const sessionSpeakers = session.speakerIds
    .map((id) => speakerById.get(id))
    .filter((s): s is Speaker => Boolean(s));

  const isTimeline = variant === "timeline";

  return (
    <div
      className={
        isTimeline
          ? "rounded-lg border-2 border-black02 bg-pastel shadow-[0_5px_0_0_var(--color-black02)] transition-transform duration-200 ease-out-devfest hover:-translate-y-1 motion-reduce:transform-none"
          : "bg-pastel transition-colors duration-200 hover:bg-primary/30"
      }
      style={isTimeline && tilt ? { rotate: `${tilt}deg` } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`session-panel-${session.id}`}
        id={`session-trigger-${session.id}`}
        className="flex w-full items-start gap-4 px-6 py-5 text-left sm:px-7"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3 py-1 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02">
              <Icon size={14} weight="duotone" aria-hidden />
              {/* Icon + text: kind is never conveyed by colour alone (§2.8) */}
              {t(KIND_LABEL_KEY[session.kind])}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-caption text-black02/65">
              <Clock size={14} weight="bold" aria-hidden />
              {t("duration", { min: session.durationMin })}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-caption text-black02/65">
              <MapPin size={14} weight="bold" aria-hidden />
              <span className="sr-only">{t("room")}: </span>
              {session.room[locale]}
            </span>
          </div>

          <p className="mt-3 font-sans text-heading-m font-bold leading-tight text-black02">
            {session.title[locale]}
          </p>

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
            <p className="text-body-m leading-relaxed text-black02/85">
              {session.description[locale]}
            </p>

            {session.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {session.tags.map((tag) => (
                  <Badge key={tag.en} tone="primary" variant="outline">
                    {tag[locale]}
                  </Badge>
                ))}
              </div>
            )}

            {(session.bring || session.provided) && (
              <dl className="mt-5 flex flex-col gap-2.5">
                {session.bring && (
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    <dt className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                      {t("bring")}
                    </dt>
                    <dd className="text-body-m text-black02/85">
                      {session.bring[locale]}
                    </dd>
                  </div>
                )}
                {session.provided && (
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    <dt className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                      {t("provided")}
                    </dt>
                    <dd className="text-body-m text-black02/85">
                      {session.provided[locale]}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {showCalendar && eventDate && session.kind !== "break" && (
              <div className="mt-5">
                <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                  {t("addToCalendar")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={googleCalendarUrl(session, locale, eventDate)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3.5 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary"
                  >
                    <CalendarPlus size={14} weight="bold" aria-hidden />
                    {t("google")}
                  </a>
                  <a
                    href={icsDataUrl(session, locale, eventDate)}
                    download={`${session.id}.ics`}
                    className="inline-flex items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3.5 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary"
                  >
                    <CalendarPlus size={14} weight="bold" aria-hidden />
                    {t("ics")}
                  </a>
                </div>
              </div>
            )}

            {sessionSpeakers.length > 0 && (
              <div className="mt-5">
                <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                  {t("speakers")}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {sessionSpeakers.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={{ pathname: "/speakers", query: { spk: s.id } }}
                        className="inline-flex items-center rounded-pill border-2 border-black02 bg-offwhite px-3.5 py-1.5 text-body-m font-bold text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary"
                      >
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
