"use client";

/* eslint-disable @next/next/no-img-element -- sponsor logos: plain <img> on purpose, see SponsorRow */

import {
  CaretDown,
  CaretLeft,
  CaretRight,
  Clock,
  MapPin,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useMediaQuery } from "@/lib/use-media-query";
import { fadeInUp } from "@/lib/motion";
import type { Session, Speaker, Sponsor } from "@/data/types";
import { InterestButton } from "./InterestProvider";
import { SessionExtras } from "./SessionExtras";
import { LocalTime } from "./LocalTime";
import { SessionMeta } from "./SessionMeta";

/** Tailwind `lg`: wide enough for parallel sessions to sit in one row. */
const WIDE_QUERY = "(min-width: 1024px)";

const NAV =
  "inline-flex h-11 items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-4 font-sans text-body-m font-bold text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary disabled:pointer-events-none disabled:opacity-35 motion-reduce:transform-none";

interface ReaderProps {
  /**
   * Every slot of the day in order — each slot is the sessions that run at
   * the same time (one for most, several when they are parallel). The reader
   * steps through these like a lightbox.
   */
  slots: Session[][];
  /** The session the reader opened on. */
  startId: string;
  speakers: Speaker[];
  partners: Sponsor[];
  showCalendar: boolean;
  onClose: () => void;
}

/**
 * The full-screen session reader, a lightbox for the schedule.
 *
 * Previous / next (buttons, the arrow keys) step through the day slot by
 * slot. A slot with ONE session fills the screen with it. A slot of
 * PARALLEL sessions shows them all at once: side by side in one row on a wide
 * screen, or as an accordion on a phone where only one is open at a time.
 */
export function SessionReader({
  slots,
  startId,
  speakers,
  partners,
  showCalendar,
  onClose,
}: ReaderProps) {
  const t = useTranslations("home.schedule");
  const tc = useTranslations("common");
  const locale = useLocale() as "fr" | "en";
  const wide = useMediaQuery(WIDE_QUERY);

  const startIndex = Math.max(
    0,
    slots.findIndex((g) => g.some((s) => s.id === startId)),
  );
  const [index, setIndex] = useState(startIndex);
  const scroller = useRef<HTMLDivElement>(null);
  // The "how to move" hint: shown on open, gone once they move, tap it, or
  // a few seconds pass.
  const [hint, setHint] = useState(true);
  const touch = useMediaQuery("(pointer: coarse)");
  useEffect(() => {
    const id = window.setTimeout(() => setHint(false), 7000);
    return () => window.clearTimeout(id);
  }, []);
  // Swipe: a mostly-horizontal drag of 60px+ moves a session.
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);

  const group = slots[index] ?? [];
  const last = slots.length - 1;
  const go = (delta: number) => {
    const next = Math.min(last, Math.max(0, index + delta));
    if (next === index) return;
    setIndex(next);
    setHint(false);
    // A new slot starts at its top, not wherever the last one was scrolled.
    if (scroller.current) scroller.current.scrollTop = 0;
  };

  // Arrow keys step through the day. The Modal already owns Escape + focus.
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowRight") goRef.current(1);
      else if (event.key === "ArrowLeft") goRef.current(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const parallel = group.length > 1;
  const row = parallel && wide;
  const time = group[0]?.time;
  const speakerById = new Map(speakers.map((s) => [s.id, s]));
  const resolve = (s: Session) => ({
    speakers: s.speakerIds
      .map((id) => speakerById.get(id))
      .filter((p): p is Speaker => Boolean(p)),
    partners: (s.partnerIds ?? [])
      .map((id) => partners.find((p) => p.id === id))
      .filter((p): p is Sponsor => Boolean(p)),
  });

  const headingId = "session-reader-title";
  const title = parallel
    ? `${time ?? ""} · ${t("readerParallel", { count: group.length })}`
    : (group[0]?.title[locale] ?? "");

  return (
    <Modal
      open
      onClose={onClose}
      variant="takeover"
      labelledBy={headingId}
      closeLabel={tc("close")}
    >
      <div
        className={`mx-auto flex max-h-[calc(100dvh-2.5rem)] w-full flex-col overflow-hidden rounded-lg border-2 border-black02 bg-pastel text-left shadow-[0_8px_0_0_var(--color-black02)] ${row ? "max-w-[96rem]" : "max-w-6xl"}`}
      >
        <h2 id={headingId} className="sr-only">
          {title}
        </h2>

        {/* The lightbox bar. Right padding leaves room for the close button. */}
        <div className="flex shrink-0 items-center gap-3 border-b-2 border-black02/15 py-3 pl-4 pr-16 sm:pl-8 sm:pr-20">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            className={NAV}
          >
            <CaretLeft size={18} weight="bold" aria-hidden />
            <span className="hidden sm:inline">{t("readerPrev")}</span>
            <span className="sr-only sm:hidden">{t("readerPrev")}</span>
          </button>
          <p
            aria-live="polite"
            className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/75"
          >
            {time && (
              <span className="rounded-pill border-2 border-black02 bg-primary px-3 py-1 text-black02">
                {time}
              </span>
            )}
            <span>
              {t("readerPosition", { current: index + 1, total: slots.length })}
            </span>
            {parallel && (
              <span className="hidden sm:inline">
                · {t("readerParallel", { count: group.length })}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === last}
            className={NAV}
          >
            <span className="hidden sm:inline">{t("readerNext")}</span>
            <span className="sr-only sm:hidden">{t("readerNext")}</span>
            <CaretRight size={18} weight="bold" aria-hidden />
          </button>
        </div>

        {hint && (
          <button
            type="button"
            onClick={() => setHint(false)}
            className="shrink-0 border-b-2 border-black02/15 bg-primary/40 px-5 py-2 text-center font-mono text-caption font-bold text-black02"
          >
            {touch ? t("readerHintSwipe") : t("readerHintKeys")}
          </button>
        )}

        <div
          ref={scroller}
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto"
          onTouchStart={(e) => {
            const p = e.touches[0];
            swipeFrom.current = p ? { x: p.clientX, y: p.clientY } : null;
          }}
          onTouchEnd={(e) => {
            const from = swipeFrom.current;
            const p = e.changedTouches[0];
            swipeFrom.current = null;
            if (!from || !p) return;
            const dx = p.clientX - from.x;
            const dy = p.clientY - from.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              go(dx < 0 ? 1 : -1);
            }
          }}
        >
          <div key={index} className={fadeInUp}>
            {!parallel ? (
              <SessionView
                session={group[0]!}
                {...resolve(group[0]!)}
                showCalendar={showCalendar}
                layout="single"
              />
            ) : row ? (
              <div
                className="grid divide-x-2 divide-black02/15"
                style={{
                  gridTemplateColumns: `repeat(${group.length}, minmax(0, 1fr))`,
                }}
              >
                {group.map((s) => (
                  <SessionView
                    key={s.id}
                    session={s}
                    {...resolve(s)}
                    showCalendar={showCalendar}
                    layout="column"
                  />
                ))}
              </div>
            ) : (
              <Accordion
                // One accordion per slot: moving on resets which is open.
                key={index}
                group={group}
                resolve={resolve}
                showCalendar={showCalendar}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Phone layout for parallel sessions: one open at a time, the first by default. */
function Accordion({
  group,
  resolve,
  showCalendar,
}: {
  group: Session[];
  resolve: (s: Session) => { speakers: Speaker[]; partners: Sponsor[] };
  showCalendar: boolean;
}) {
  const t = useTranslations("home.schedule");
  const locale = useLocale() as "fr" | "en";
  const [openId, setOpenId] = useState<string | null>(group[0]?.id ?? null);
  return (
    <ul className="flex flex-col divide-y-2 divide-black02/15">
      {group.map((s) => {
        const open = openId === s.id;
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`reader-panel-${s.id}`}
              id={`reader-trigger-${s.id}`}
              onClick={() => setOpenId(open ? null : s.id)}
              className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors ${open ? "bg-primary/30" : "hover:bg-primary/20"}`}
            >
              <span className="min-w-0 flex-1">
                {s.room?.[locale] && (
                  <span className="flex items-center gap-1.5 font-mono text-caption text-black02/70">
                    <MapPin size={14} weight="bold" aria-hidden />
                    <span className="sr-only">{t("room")}: </span>
                    {s.room[locale]}
                  </span>
                )}
                <span className="mt-1 block font-sans text-heading-m font-bold leading-tight text-black02">
                  {s.title[locale]}
                </span>
              </span>
              <span
                aria-hidden
                className={`mt-1 shrink-0 rounded-pill border-2 border-black02 p-1.5 transition-transform duration-300 ease-bouncy motion-reduce:transition-none ${open ? "rotate-180 bg-primary" : ""}`}
              >
                <CaretDown size={16} weight="bold" />
              </span>
            </button>
            {open && (
              <div
                id={`reader-panel-${s.id}`}
                role="region"
                aria-labelledby={`reader-trigger-${s.id}`}
              >
                <SessionView
                  session={s}
                  {...resolve(s)}
                  showCalendar={showCalendar}
                  layout="stacked"
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One session's content in the reader.
 *   single  — a whole screen: header, then description beside the extras;
 *   column  — one of several side by side: a narrow, stacked column;
 *   stacked — inside a phone accordion: the title is already the trigger.
 */
function SessionView({
  session,
  speakers,
  partners,
  showCalendar,
  layout,
}: {
  session: Session;
  speakers: Speaker[];
  partners: Sponsor[];
  showCalendar: boolean;
  layout: "single" | "column" | "stacked";
}) {
  const t = useTranslations("home.schedule");
  const locale = useLocale() as "fr" | "en";
  const single = layout === "single";

  const heart =
    session.kind !== "break" ? (
      <InterestButton sessionId={session.id} className="ml-auto" />
    ) : null;

  const chips = (
    <div className="flex flex-wrap items-center gap-2.5">
      <SessionMeta session={session} />
      <LocalTime time={session.time} />
      {session.durationMin !== undefined && (
        <span className="flex items-center gap-1.5 font-mono text-caption text-black02/65">
          <Clock size={14} weight="bold" aria-hidden />
          {t("duration", { min: session.durationMin })}
        </span>
      )}
      {session.room?.[locale] && layout !== "stacked" && (
        <span className="flex items-center gap-1.5 font-mono text-caption text-black02/65">
          <MapPin size={14} weight="bold" aria-hidden />
          <span className="sr-only">{t("room")}: </span>
          {session.room[locale]}
        </span>
      )}
      {heart}
    </div>
  );

  const names = speakers.length > 0 && (
    <p
      className={`font-mono text-black02/75 ${single ? "mt-2 text-body-m" : "mt-2 text-caption"}`}
    >
      {speakers.map((s) => s.name).join(" · ")}
    </p>
  );

  const logos = partners.length > 0 && (
    <ul className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      {partners.map((p) => (
        <li key={p.id}>
          <img
            src={p.logoUrl}
            alt={p.name}
            className={`w-auto object-contain ${single ? "h-12" : "h-9"}`}
          />
        </li>
      ))}
    </ul>
  );

  if (single) {
    return (
      <>
        <header className="border-b-2 border-black02/15 px-6 py-6 sm:px-10 sm:py-8">
          {chips}
          <p
            aria-hidden
            className="mt-4 font-sans text-heading-l font-bold leading-tight text-black02 sm:text-display-l"
          >
            {session.title[locale]}
          </p>
          {names}
          {logos}
        </header>
        <div className="grid gap-8 px-6 py-6 sm:px-10 sm:py-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-12">
          <p className="whitespace-pre-line text-body-l leading-relaxed text-black02/90">
            {session.description[locale]}
          </p>
          <aside className="flex flex-col lg:border-l-2 lg:border-black02/15 lg:pl-10">
            <SessionExtras
              session={session}
              speakers={speakers}
              showCalendar={showCalendar}
            />
          </aside>
        </div>
      </>
    );
  }

  return (
    <article className="flex min-w-0 flex-col px-5 py-5 sm:px-6 sm:py-6">
      {chips}
      {layout === "column" && (
        <h3 className="mt-3 font-sans text-heading-m font-bold leading-tight text-black02">
          {session.title[locale]}
        </h3>
      )}
      {names}
      {logos}
      <p className="mt-4 whitespace-pre-line text-body-m leading-relaxed text-black02/90">
        {session.description[locale]}
      </p>
      <SessionExtras
        session={session}
        speakers={speakers}
        showCalendar={showCalendar}
      />
    </article>
  );
}
