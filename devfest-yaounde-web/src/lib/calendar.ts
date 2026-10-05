import type { Session } from "@/data/types";

/** Repository fallback. The admin can override the event's single date. */
export const EVENT_DATES: readonly string[] = ["2026-11-21"];

/**
 * The first day, or null if no dates are set.
 *
 * Kept because the calendar UI and the `Event` structured data both gate on
 * "is there a date at all", and that question has one answer whatever the
 * shape of the rest.
 */
export const EVENT_BASE_DATE: string | null = EVENT_DATES[0] ?? null;

/** The calendar date a given 1-based event day falls on. */
export function dateForDay(day: number): string | null {
  return EVENT_DATES[day - 1] ?? null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Local wall-clock stamp, e.g. 20261114T100000 */
function stamp(date: Date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

/** All sessions occur on the configured single event date. */
function sessionRange(session: Session, baseDate: string) {
  const dayDate = baseDate;
  const [y, m, d] = dayDate.split("-").map(Number);
  const [hh, mm] = session.time.split(":").map(Number);
  const start = new Date(y, m - 1, d, hh, mm);
  const end = new Date(start.getTime() + session.durationMin * 60_000);
  return { start, end };
}

export function googleCalendarUrl(
  session: Session,
  locale: "fr" | "en",
  baseDate: string,
) {
  const { start, end } = sessionRange(session, baseDate);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: session.title[locale],
    details: session.description[locale],
    location: session.room[locale],
    dates: `${stamp(start)}/${stamp(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** A minimal VEVENT, returned as a data URL for direct download. */
export function icsDataUrl(
  session: Session,
  locale: "fr" | "en",
  baseDate: string,
) {
  const { start, end } = sessionRange(session, baseDate);
  const escape = (s: string) =>
    s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DevFest Yaounde//EN",
    "BEGIN:VEVENT",
    `UID:${session.id}@devfest-yaounde`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(session.title[locale])}`,
    `DESCRIPTION:${escape(session.description[locale])}`,
    `LOCATION:${escape(session.room[locale])}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}
