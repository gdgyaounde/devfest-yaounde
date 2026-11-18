"use client";

import {
  ArrowRight,
  CalendarPlus,
  CaretDown,
  Clock,
  MapPin,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ContentImage } from "@/components/ui/ContentImage";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Link } from "@/i18n/navigation";
import { useEventDates } from "@/components/global/EventDateProvider";
import { googleCalendarUrl, icsDataUrl } from "@/lib/calendar";
import { hasCalendarSlot } from "@/lib/sessions";
import { SessionMeta } from "./SessionMeta";
import type { Session, Speaker, Sponsor } from "@/data/types";

/** Past this many characters (or lines) a description is finished in the reader. */
const LONG_TEXT = 420;

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

  const [reading, setReading] = useState(false);
  const text = session.description[locale] ?? "";
  const long = text.length > LONG_TEXT || text.split("\n").length > 6;

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
            {long && !detailsHref && (
              <button
                type="button"
                tabIndex={open ? undefined : -1}
                onClick={() => setReading(true)}
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
      {reading && (
        <SessionReader
          session={session}
          speakers={sessionSpeakers}
          partners={sessionPartners}
          showCalendar={showCalendar}
          onClose={() => setReading(false)}
        />
      )}
    </div>
  );
}

/**
 * Everything around a session's description — tags, what to bring, who
 * speaks, add-to-calendar. One component so the card and the full-screen
 * reader can never drift apart.
 */
function SessionExtras({
  session,
  speakers,
  showCalendar,
  large = false,
}: {
  session: Session;
  speakers: Speaker[];
  showCalendar: boolean;
  /** The full-screen reader shows the speaker photos bigger. */
  large?: boolean;
}) {
  const eventDate = useEventDates()[0];
  const t = useTranslations("home.schedule");
  const locale = useLocale() as "fr" | "en";
  const sessionSpeakers = speakers;
  return (
    <>
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

      {showCalendar &&
        eventDate &&
        session.kind !== "break" &&
        hasCalendarSlot(session) && (
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
                  className={`inline-flex items-center gap-3 rounded-pill border-2 border-black02 bg-offwhite py-1 pl-1 pr-5 font-bold ${large ? "text-body-l" : "text-body-m"} text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary`}
                >
                  <span
                    aria-hidden
                    className={`relative shrink-0 overflow-hidden rounded-pill border-2 border-black02 bg-pastel ${large ? "h-14 w-14" : "h-8 w-8"}`}
                  >
                    <ContentImage
                      src={s.photoUrl}
                      alt=""
                      sizes={large ? "56px" : "32px"}
                    />
                  </span>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * The full-screen reader for a long session (opened from "Read more").
 *
 * Header: what and when — format chips, duration, room, title, speakers and
 * partner logos. Body: the whole description on the left, the practical bits
 * (tags, what to bring, speakers, calendar) beside it on a wide screen and
 * under it on a phone, so nothing is cut and the eye never has to hunt.
 */
function SessionReader({
  session,
  speakers,
  partners,
  showCalendar,
  onClose,
}: {
  session: Session;
  speakers: Speaker[];
  partners: Sponsor[];
  showCalendar: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("home.schedule");
  const tc = useTranslations("common");
  const locale = useLocale() as "fr" | "en";
  const headingId = `session-reader-${session.id}`;
  return (
    <Modal
      open
      onClose={onClose}
      variant="takeover"
      labelledBy={headingId}
      closeLabel={tc("close")}
    >
      <div className="mx-auto flex max-h-[calc(100dvh-2.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border-2 border-black02 bg-pastel text-left shadow-[0_8px_0_0_var(--color-black02)]">
        <header className="shrink-0 border-b-2 border-black02/15 px-6 py-6 pr-16 sm:px-10 sm:py-8">
          <div className="flex flex-wrap items-center gap-2.5">
            {session.time && (
              <span className="rounded-pill border-2 border-black02 bg-primary px-3 py-1 font-mono text-mono-tag font-bold text-black02">
                {session.time}
              </span>
            )}
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
          <h2
            id={headingId}
            className="mt-4 font-sans text-heading-l font-bold leading-tight text-black02 sm:text-display-l"
          >
            {session.title[locale]}
          </h2>
          {speakers.length > 0 && (
            <p className="mt-2 font-mono text-body-m text-black02/75">
              {speakers.map((s) => s.name).join(" · ")}
            </p>
          )}
          {partners.length > 0 && (
            <ul className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
              {partners.map((p) => (
                <li key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.logoUrl}
                    alt={p.name}
                    className="h-12 w-auto object-contain"
                  />
                </li>
              ))}
            </ul>
          )}
        </header>

        <div className="grid min-h-0 flex-1 gap-8 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-12">
          <p className="whitespace-pre-line text-body-l leading-relaxed text-black02/90">
            {session.description[locale]}
          </p>
          <aside className="flex flex-col lg:border-l-2 lg:border-black02/15 lg:pl-10">
            <SessionExtras
              session={session}
              speakers={speakers}
              showCalendar={showCalendar}
              large
            />
          </aside>
        </div>
      </div>
    </Modal>
  );
}
