import type { Session } from "@/data/types";

/**
 * Session helpers shared by the schedule, the speaker profiles and the
 * calendar links (ADR 0073).
 *
 * Accepted sessions can now exist before they have a slot. Everything that
 * needs a time asks these guards first, so "not scheduled yet" is one rule
 * rather than a `session.time &&` scattered through the components.
 */

/** A session with a start time — it can sit on the timeline. */
export type ScheduledSession = Session & { time: string };

/** A session that can be exported to a calendar: a start AND a length. */
export type CalendarSession = Session & { time: string; durationMin: number };

const HH_MM = /^\d{2}:\d{2}$/;

export function isScheduled(session: Session): session is ScheduledSession {
  return typeof session.time === "string" && HH_MM.test(session.time);
}

/**
 * Add-to-calendar needs an end as well as a start. A session with a time but
 * no duration stays off the calendar rather than getting an invented length.
 */
export function hasCalendarSlot(session: Session): session is CalendarSession {
  return (
    isScheduled(session) &&
    typeof session.durationMin === "number" &&
    session.durationMin > 0
  );
}

/** The unscheduled programme is grouped by format, in this order. */
export type ProgrammeGroup = "workshop" | "lightning" | "other";

export function programmeGroup(session: Session): ProgrammeGroup {
  if (session.kind === "workshop") return "workshop";
  if (session.lightning) return "lightning";
  return "other";
}

const GROUP_ORDER: ProgrammeGroup[] = ["workshop", "lightning", "other"];

/**
 * Unscheduled sessions, grouped workshops → lightning talks → everything
 * else, each group keeping the order the sessions are stored in (which is
 * the order an organiser arranged them in the dashboard). Empty groups are
 * dropped. `limit` caps each group — the home preview shows a taste.
 */
export function groupProgramme(
  sessions: Session[],
  limit?: number,
): { group: ProgrammeGroup; sessions: Session[]; total: number }[] {
  return GROUP_ORDER.map((group) => {
    const all = sessions.filter((s) => programmeGroup(s) === group);
    return {
      group,
      sessions: limit === undefined ? all : all.slice(0, limit),
      total: all.length,
    };
  }).filter((g) => g.total > 0);
}

/**
 * Whether a localized value actually says something.
 *
 * The CSV import fills required-but-unknown fields with "—" (`from-csv.ts`),
 * and the Sessionize import does the same for icebreakers a speaker left
 * blank. Rendering that dash would show an empty question with a stray mark
 * — so a blank or "—" value counts as absent everywhere it is displayed.
 */
export function hasText(
  value: { fr: string; en: string } | undefined | null,
  locale: "fr" | "en",
): boolean {
  const text = value?.[locale]?.trim() ?? "";
  return text !== "" && text !== "—" && text !== "-";
}
