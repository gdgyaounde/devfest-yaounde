/**
 * The "Up next" strip on /schedule (ADR 0097).
 *
 * Two short rows pinned above the programme while the day is moving: what is going on now and what comes next.
 * It never edits the programme: the timeline below stays exactly as published.
 * Each entry names a session and, optionally, the room it is in right now
 * (1 to 3 today) — handy when a room changes on the day.
 *
 * Source: `src/data/up-next.json`. Two rows, `now` and `next`; an empty row is hidden.
 * (Not to be confused with `spotlight.ts`, the daily speaker spotlight.)
 */
import upNextJson from "@/data/up-next.json";
import type { Session, Speaker } from "@/data/types";

export interface UpNextEntry {
  sessionId: string;
  /** Room number shown on the card; falls back to the session's own room. */
  room?: number;
}

export interface UpNextItem {
  session: Session;
  speakers: Speaker[];
  room: { fr: string; en: string } | null;
}

export type UpNextRow = "now" | "next";

/** The entries of one row: "now" (going on now) or "next" (coming up next). */
export function upNextEntries(row: UpNextRow): UpNextEntry[] {
  return (upNextJson as Record<UpNextRow, UpNextEntry[]>)[row] ?? [];
}

/** Resolve entries against the live sessions; unknown or hidden ones are skipped. */
export function resolveUpNext(
  entries: UpNextEntry[],
  sessions: Session[],
  speakers: Speaker[],
): UpNextItem[] {
  const out: UpNextItem[] = [];
  for (const entry of entries) {
    const session = sessions.find((s) => s.id === entry.sessionId);
    if (!session || session.hidden) continue;
    out.push({
      session,
      speakers: session.speakerIds
        .map((id) => speakers.find((p) => p.id === id))
        .filter((p): p is Speaker => Boolean(p)),
      room: entry.room
        ? { fr: `Salle ${entry.room}`, en: `Room ${entry.room}` }
        : (session.room ?? null),
    });
  }
  return out;
}
