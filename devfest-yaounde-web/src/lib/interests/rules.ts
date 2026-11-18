import { z } from "zod";

/**
 * "This interests me" (ADR 0086): the pure rules, so they are unit-tested
 * without a database.
 */

/** Per account — a schedule has ~40 entries; this only stops a script. */
export const MAX_INTERESTS = 60;

export const interestSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(120),
    interested: z.boolean(),
  })
  .strict();

export type InterestInput = z.infer<typeof interestSchema>;

/**
 * Only an id that exists on the schedule can be marked, so the table cannot be
 * stuffed with arbitrary strings.
 */
export function knownSession(
  sessionId: string,
  sessions: readonly { id: string }[],
): boolean {
  return sessions.some((s) => s.id === sessionId);
}

/** The admin's per-session numbers: titles joined on, zero-interest sessions left out. */
export function interestRows(
  counts: readonly { session_id: string; interested: number }[],
  sessions: readonly {
    id: string;
    time?: string;
    title: { fr: string; en: string };
  }[],
): { sessionId: string; title: string; time: string; interested: number }[] {
  const byId = new Map(sessions.map((s) => [s.id, s] as const));
  return counts
    .filter((c) => c.interested > 0)
    .map((c) => {
      const s = byId.get(c.session_id);
      return {
        sessionId: c.session_id,
        title: s ? s.title.en || s.title.fr : c.session_id,
        time: s?.time ?? "",
        interested: Number(c.interested),
      };
    })
    .sort(
      (a, b) => b.interested - a.interested || a.title.localeCompare(b.title),
    );
}
