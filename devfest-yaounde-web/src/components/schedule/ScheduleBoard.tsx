"use client";

import { ListBullets, SquaresFour } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { FilterGroup } from "@/components/ui/FilterGroup";
import { FilterLayout } from "@/components/ui/FilterLayout";
import { Reveal } from "@/components/ui/Reveal";
import { sessionIn, sessionStyle } from "@/lib/motion";
import {
  groupProgramme,
  isScheduled,
  type ProgrammeGroup,
} from "@/lib/sessions";
import { SessionCard } from "./SessionCard";
import type { Session, Speaker, Sponsor } from "@/data/types";

const GROUP_LABEL_KEY: Record<ProgrammeGroup, string> = {
  workshop: "groupWorkshop",
  lightning: "groupLightning",
  other: "groupOther",
};

export interface ScheduleBoardProps {
  sessions: Session[];
  speakers?: Speaker[];
  partners?: Sponsor[];
  /** Full route shows track/room filters; the Home preview keeps it simple. */
  showFilters?: boolean;
  /** Full route offers add-to-calendar per session. */
  showCalendar?: boolean;
  /**
   * Caps each group of the UNSCHEDULED programme (ADR 0073). The home
   * preview shows a taste; /schedule shows everything.
   */
  previewLimit?: number;
  /** The programme heading's level — h3 under the home section's own h2. */
  programmeHeading?: "h2" | "h3";
}

/**
 * The schedule board — day tabs, structured/list toggle, expandable sessions.
 *
 * Shared by the Home preview and the full `/schedule` route so there is one
 * implementation of the toggle, the expand behaviour and the timeline
 * treatment. `showFilters` is the only difference between the two surfaces.
 *
 * PAGES.md §3 accessibility is preserved: the list view is a genuinely plain
 * semantic list (no tilts, no spine) and is a first-class option, not an
 * afterthought; session kind always carries an icon + text label.
 */
export function ScheduleBoard({
  sessions,
  speakers = [],
  partners = [],
  showFilters = false,
  showCalendar = false,
  previewLimit,
  programmeHeading = "h2",
}: ScheduleBoardProps) {
  const t = useTranslations("home.schedule");
  const locale = useLocale() as "fr" | "en";

  const days = useMemo(
    () => [...new Set(sessions.map((s) => s.day))].sort((a, b) => a - b),
    [sessions],
  );
  const tracks = useMemo(
    () => [...new Set(sessions.map((s) => s.track[locale]))].sort(),
    [sessions, locale],
  );
  // Only rooms that exist — an unscheduled session has none yet, and a
  // room filter with no rooms in it is a control that does nothing.
  const rooms = useMemo(
    () =>
      [
        ...new Set(
          sessions
            .map((s) => s.room?.[locale] ?? "")
            .filter((r) => r.trim() !== ""),
        ),
      ].sort(),
    [sessions, locale],
  );

  const [activeDay, setActiveDay] = useState(days[0] ?? 1);
  const [view, setView] = useState<"structured" | "list">("structured");
  const [track, setTrack] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  /*
   * Deep links (`/schedule?session=<id>`), which the home preview's "Full
   * details" links use. On the full page only: once mounted, open that
   * session through its own toggle (a click, so no state is set from this
   * effect) and bring it into view.
   */
  useEffect(() => {
    if (previewLimit !== undefined) return;
    const id = new URLSearchParams(window.location.search).get("session");
    if (!id) return;
    const timer = window.setTimeout(() => {
      const trigger = document.getElementById(`session-trigger-${id}`);
      if (!trigger) return;
      if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
      trigger.scrollIntoView({ block: "center" });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [previewLimit]);

  /** The home preview links each card to its full entry on /schedule. */
  const detailsFor = (id: string) =>
    previewLimit !== undefined
      ? `/schedule?session=${encodeURIComponent(id)}`
      : undefined;

  /*
   * Sessions WITH a time go on the timeline; sessions without one are
   * accepted but not yet slotted (ADR 0073) and go in the programme list
   * below it, grouped by format. Nothing gets an invented time.
   */
  const visible = sessions
    .filter(isScheduled)
    .filter((s) => s.day === activeDay)
    .filter((s) => !track || s.track[locale] === track)
    .filter((s) => !room || s.room?.[locale] === room)
    .sort((a, b) => a.time.localeCompare(b.time));

  // A room filter can only ever match a slotted session.
  const programme = groupProgramme(
    sessions
      .filter((s) => !isScheduled(s))
      .filter((s) => !track || s.track[locale] === track)
      .filter(() => !room),
    previewLimit,
  );
  const ProgrammeHeading = programmeHeading;

  /**
   * PARALLEL TRACKS — PHASE10 §6. Sessions that start at the same time on the
   * same day run against each other, so the schedule groups by TIMESLOT and
   * both views render a slot as a unit.
   *
   * No schema change was needed: `day + time` already identifies a slot and
   * `room` already distinguishes the concurrent sessions within it. Adding a
   * `slotId` would have been redundant data that could drift out of sync with
   * the times it duplicates.
   *
   * A one-session slot renders exactly as before, so single-track days and
   * the Home preview are unaffected.
   */
  const slots = useMemo(() => {
    const byTime = new Map<string, Session[]>();
    for (const s of visible) {
      const bucket = byTime.get(s.time);
      if (bucket) bucket.push(s);
      else byTime.set(s.time, [s]);
    }
    // Concurrent sessions sort by room so a given room keeps the same column
    // position down the day rather than hopping between slots.
    for (const bucket of byTime.values()) {
      bucket.sort((a, b) =>
        (a.room?.[locale] ?? "").localeCompare(b.room?.[locale] ?? ""),
      );
    }
    return [...byTime.entries()];
    // `visible` is derived fresh each render; the deps that actually change it
    // are the day, the two filters and the locale.
  }, [sessions, activeDay, track, room, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = (track ? 1 : 0) + (room ? 1 : 0);

  /**
   * Filters as labelled groups inside the shared FilterLayout (PHASE9 §2/§3).
   * Day stays in the main column as prominent tabs — it's the primary axis
   * people navigate by, not a refinement, so burying it in a sidebar drawer
   * would cost more than it tidies.
   */
  const filters = (
    <>
      <FilterGroup
        label={t("track")}
        selected={track}
        onSelect={setTrack}
        collapsible
        options={[
          { value: null, label: t("allTracks") },
          ...tracks.map((tr) => ({ value: tr, label: tr })),
        ]}
      />
      {rooms.length > 0 && (
        <FilterGroup
          label={t("room")}
          selected={room}
          onSelect={setRoom}
          collapsible
          options={[
            { value: null, label: t("allRooms") },
            ...rooms.map((rm) => ({ value: rm, label: rm })),
          ]}
        />
      )}
    </>
  );

  const board = (
    <>
      {/* Day tabs + view toggle */}
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-6">
          {/* One day (2026 — ADR 0071) means no choice to make, so no tab
              bar at all: a single pressed "Day 1" button reads as a control
              that does nothing. The tabs come back on their own the moment a
              session carries a second `day`. */}
          {days.length > 1 ? (
            <div className="flex flex-wrap gap-3">
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setActiveDay(d);
                    setOpenId(null);
                  }}
                  aria-pressed={d === activeDay}
                  className={`day-tab rounded-lg border-2 border-black02 px-6 py-3.5 font-sans text-body-l font-bold hover:-translate-y-0.5 motion-reduce:transform-none ${
                    d === activeDay
                      ? "bg-primary text-black02 shadow-[0_5px_0_0_var(--color-black02)]"
                      : "bg-transparent text-black02/70 hover:bg-pastel"
                  }`}
                >
                  {t("day", { day: d })}
                </button>
              ))}
            </div>
          ) : (
            <span aria-hidden />
          )}

          <div className="flex items-center gap-3">
            <span
              id="schedule-view-label"
              className="hidden font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65 sm:inline"
            >
              {t("viewLabel")}
            </span>
            <div
              role="group"
              aria-labelledby="schedule-view-label"
              className="flex overflow-hidden rounded-pill border-2 border-black02"
            >
              {(
                [
                  ["structured", SquaresFour, t("viewStructured")],
                  ["list", ListBullets, t("viewList")],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  className={`flex items-center gap-2 px-4 py-3.5 font-mono text-mono-tag font-bold uppercase tracking-wide transition-colors duration-200 ${
                    view === key
                      ? "bg-black02 text-offwhite"
                      : "bg-transparent text-black02 hover:bg-pastel"
                  }`}
                >
                  <Icon size={16} weight="bold" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      {/* key remounts on day/view/filter change so the stagger replays */}
      <div
        key={`${activeDay}-${view}-${track ?? ""}-${room ?? ""}`}
        className="mt-12"
      >
        {visible.length === 0 && programme.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-black02/30 px-7 py-12 text-center text-body-l text-black02/70">
            {t("empty")}
          </p>
        ) : visible.length === 0 ? null : view === "structured" ? (
          <ol className="relative flex flex-col gap-6 border-l-4 border-dashed border-black02/25 pl-6 sm:pl-10">
            {slots.map(([time, group], i) => (
              <li
                key={time}
                className={`${sessionIn} relative`}
                style={sessionStyle(i)}
              >
                {/* One marker per TIMESLOT, not per session — concurrent
                    sessions share a start time and stacking two identical
                    markers would read as two different times. */}
                <span className="absolute -left-6 top-6 -translate-x-1/2 rounded-pill border-2 border-black02 bg-primary px-3 py-1 font-mono text-mono-tag font-bold text-black02 sm:-left-10">
                  {time}
                </span>
                <div className="ml-6 sm:ml-8">
                  {group.length > 1 && (
                    <p className="mb-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                      {t("parallel", { count: group.length })}
                    </p>
                  )}
                  {/*
                    Parallel sessions become side-by-side columns. They stay
                    stacked below `md` — two of these cards side by side on a
                    phone would be unreadable, and the room label on each card
                    already says which is which.
                  */}
                  <div
                    className={
                      group.length > 1
                        ? "grid grid-cols-1 items-stretch gap-5 md:grid-cols-2"
                        : ""
                    }
                  >
                    {group.map((s, j) => (
                      /* Equal-height cells: the card stretches to its row so
                         parallel sessions never leave a ragged gap, and an
                         odd one out spans the full row instead of leaving a
                         hole beside it. */
                      <div
                        key={s.id}
                        className={`flex [&>*]:w-full ${
                          group.length % 2 === 1 && j === group.length - 1
                            ? "md:col-span-2"
                            : ""
                        }`}
                      >
                        <SessionCard
                          session={s}
                          speakers={speakers}
                          partners={partners}
                          open={openId === s.id}
                          onToggle={() =>
                            setOpenId(openId === s.id ? null : s.id)
                          }
                          variant="timeline"
                          showCalendar={showCalendar}
                          detailsHref={detailsFor(s.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          /*
            List view groups BY TIMESLOT (PHASE10 §6): a <ul> of slots, each
            containing its own <ul> of concurrent sessions. That nesting is
            the accessible statement of "these run at the same time" — a flat
            list would say only "these come one after another", which is
            wrong. Still a genuinely plain semantic list: no tilts, no spine.
          */
          <ul className="flex flex-col divide-y-2 divide-black02/10 overflow-hidden rounded-lg border-2 border-black02">
            {slots.map(([time, group], i) => (
              <li key={time} className={sessionIn} style={sessionStyle(i)}>
                <div className="flex items-start gap-4 bg-pastel">
                  <span className="shrink-0 py-5 pl-6 font-mono text-mono-tag font-bold text-black02 sm:pl-7">
                    {time}
                  </span>
                  <div className="min-w-0 flex-1">
                    {group.length > 1 && (
                      <p className="pr-6 pt-5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                        {t("parallel", { count: group.length })}
                      </p>
                    )}
                    <ul className="flex flex-col divide-y-2 divide-black02/10">
                      {group.map((s) => (
                        <li key={s.id}>
                          <SessionCard
                            session={s}
                            speakers={speakers}
                            partners={partners}
                            open={openId === s.id}
                            onToggle={() =>
                              setOpenId(openId === s.id ? null : s.id)
                            }
                            variant="list"
                            showCalendar={showCalendar}
                            detailsHref={detailsFor(s.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/*
          THE PROGRAMME — accepted sessions without a slot yet (ADR 0073).
          Grouped by format (workshops, then lightning talks), never on the
          timeline: a time the organisers have not set is not shown. Same
          card, same view toggle, so a session looks identical before and
          after it gets its time.
        */}
        {programme.length > 0 && (
          <section
            aria-labelledby="programme-title"
            className={visible.length > 0 ? "mt-20" : ""}
          >
            <ProgrammeHeading
              id="programme-title"
              className="font-sans text-heading-l font-bold leading-tight text-black02"
            >
              {t("programmeTitle")}
            </ProgrammeHeading>
            <p className="mt-3 max-w-2xl text-body-m text-black02/75">
              {t("programmeBody")}
            </p>

            {programme.map(({ group, sessions: list, total }) => (
              <div key={group} className="mt-12">
                <p className="flex items-center gap-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                  {t(GROUP_LABEL_KEY[group] as "groupWorkshop")}
                  <span className="rounded-pill border-2 border-black02/30 px-2.5 py-0.5 text-black02/70">
                    {total}
                  </span>
                </p>
                {view === "structured" ? (
                  <ul className="mt-5 grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                    {list.map((s, i) => (
                      <li
                        key={s.id}
                        className={sessionIn}
                        style={sessionStyle(i)}
                      >
                        <SessionCard
                          session={s}
                          speakers={speakers}
                          partners={partners}
                          open={openId === s.id}
                          onToggle={() =>
                            setOpenId(openId === s.id ? null : s.id)
                          }
                          variant="timeline"
                          showCalendar={showCalendar}
                          detailsHref={detailsFor(s.id)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="mt-5 flex flex-col divide-y-2 divide-black02/10 overflow-hidden rounded-lg border-2 border-black02">
                    {list.map((s, i) => (
                      <li
                        key={s.id}
                        className={sessionIn}
                        style={sessionStyle(i)}
                      >
                        <SessionCard
                          session={s}
                          speakers={speakers}
                          partners={partners}
                          open={openId === s.id}
                          onToggle={() =>
                            setOpenId(openId === s.id ? null : s.id)
                          }
                          variant="list"
                          showCalendar={showCalendar}
                          detailsHref={detailsFor(s.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {list.length < total && (
                  <p className="mt-4 font-mono text-caption text-black02/65">
                    {t("groupMore", { count: total - list.length })}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );

  // The Home preview has no filters, so it skips the sidebar layout entirely
  // rather than rendering an empty one.
  if (!showFilters) return board;

  return (
    <FilterLayout
      filters={filters}
      activeCount={activeCount}
      onClearAll={() => {
        setTrack(null);
        setRoom(null);
      }}
    >
      {board}
    </FilterLayout>
  );
}
