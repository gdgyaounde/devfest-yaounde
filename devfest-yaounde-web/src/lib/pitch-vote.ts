/**
 * The pitch contest public vote (ADR 0099) — the rules, kept pure so they
 * are tested without a database.
 *
 * Who may vote is decided IN THE DATABASE (`pitch_vote_eligible`): any
 * account on the site since migration 0047 (0046 required a check-in).
 * What is decided here: which projects are on the ballot, whether voting is
 * open, what a request may ask for, and how a tally becomes a ranking.
 */
import { z } from "zod";
import projects from "@/data/pitch-projects.json";
import { VOTE_CLOSES_AT } from "@/lib/site-config";

export interface PitchProject {
  id: string;
  team: string;
  name: string;
  tagline: { fr: string; en: string };
  /** The team's own words, as they sent them. */
  pitch: string;
  /** The language of `pitch` ("fr" or "en"); French unless said otherwise. */
  pitchLang?: string;
  url?: string;
  note?: { fr: string; en: string };
  /**
   * A WhatsApp contact, as a wa.me link: the number in international form,
   * digits only (Cameroon: 237…), and what to call it.
   */
  whatsapp?: { number: string; label: { fr: string; en: string } };
}

/** The ballot, in the order the teams pitched. */
export const PITCH_PROJECTS: PitchProject[] = projects;

const ids = PITCH_PROJECTS.map((p) => p.id) as [string, ...string[]];

/** How many projects one person may vote for (one vote each). */
export const MAX_PICKS = 2;

/**
 * A vote request: the voter's whole set of picks — none, one or two
 * distinct projects on the ballot. Sending the set (not "add"/"remove")
 * makes a repeated or out-of-order request harmless.
 */
export const voteSchema = z
  .object({
    projectIds: z
      .array(z.enum(ids))
      .max(MAX_PICKS)
      .refine((list) => new Set(list).size === list.length, "duplicate"),
  })
  .strict();

export function voteClosesAt(): Date {
  return new Date(VOTE_CLOSES_AT);
}

/** Open from the moment this ships until the closing instant, exclusive. */
export function voteOpen(now: Date, closesAt: Date = voteClosesAt()): boolean {
  return now.getTime() < closesAt.getTime();
}

export interface RankedProject {
  id: string;
  votes: number;
  /**
   * Whole-number share of VOTERS who picked it (each may pick two, so these
   * can add up past 100); 0 when nobody voted.
   */
  percent: number;
  /** 1 for the top; projects on the same count share a rank. */
  rank: number;
}

/**
 * Turn the raw tally into a ranking. Every project on the ballot appears,
 * with 0 if nobody chose it; votes for an id no longer on the ballot are
 * ignored. Ties share a rank (1, 1, 3), and keep pitch order among
 * themselves so nothing looks arbitrary.
 */
export function rankTally(
  tally: Record<string, number>,
  voters: number,
  ballot: Pick<PitchProject, "id">[] = PITCH_PROJECTS,
): RankedProject[] {
  const rows = ballot.map((p, order) => ({
    id: p.id,
    order,
    votes: Math.max(0, Math.floor(Number(tally[p.id]) || 0)),
  }));
  // Nobody can be counted twice for one project, so a project never has more
  // votes than there are voters; guard anyway so a share never passes 100.
  const total = Math.max(voters, ...rows.map((r) => r.votes), 0);
  rows.sort((a, b) => b.votes - a.votes || a.order - b.order);
  let rank = 0;
  let previous = -1;
  return rows.map((r, i) => {
    if (r.votes !== previous) {
      rank = i + 1;
      previous = r.votes;
    }
    return {
      id: r.id,
      votes: r.votes,
      percent: total ? Math.round((r.votes / total) * 100) : 0,
      rank,
    };
  });
}

/** What `pitch_vote_stats()` returns, checked rather than trusted. */
export interface VoteStats {
  /** Accounts that may vote. */
  eligible: number;
  /** People who voted (one or two picks). */
  voters: number;
  /** Picks in all. */
  votes: number;
  tally: Record<string, number>;
}

export function parseVoteStats(value: unknown): VoteStats | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const tally: Record<string, number> = {};
  if (v.tally && typeof v.tally === "object") {
    for (const [k, n] of Object.entries(v.tally as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n)) tally[k] = n;
    }
  }
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return {
    eligible: n(v.eligible),
    voters: n(v.voters),
    votes: n(v.votes),
    tally,
  };
}

/** True when a Supabase error means "migration 0046 isn't applied yet". */
export function isMissingVoteSchema(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "PGRST202" || // function not found
    error.code === "42883" ||
    error.code === "42P01" || // relation does not exist
    error.code === "PGRST205" ||
    /does not exist|could not find/i.test(error.message ?? "")
  );
}
