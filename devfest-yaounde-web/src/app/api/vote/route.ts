/**
 * /api/vote — the pitch contest public vote (ADR 0099).
 *
 *   GET   → { open, closesAt, signedIn, eligible, myVotes, results }
 *   POST  { projectIds: [] | [a] | [a, b] } → 200 { projectIds } | 401
 *         | 403 not_eligible | 409 vote_closed | 503 vote_unavailable
 *
 * Who may vote is the DATABASE's call (`pitch_vote_eligible`, migration
 * 0046): checked in at the door, as the person who was there, matched on the
 * account id and the account's own email — never on anything in the
 * request. Up to two picks per account (one vote each), sent as the whole
 * set and replaced atomically; changeable until the close.
 *
 * Results are only ever sent once voting has closed; before that a voter
 * sees their own choice and nothing else (the organisers see the live tally
 * in the dashboard).
 *
 * Fails CLOSED: without migration 0046 the functions don't exist, so GET says
 * `unavailable` and POST answers 503, writing nothing.
 */
import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import {
  PITCH_PROJECTS,
  isMissingVoteSchema,
  parseVoteStats,
  rankTally,
  voteClosesAt,
  voteOpen,
  voteSchema,
  type RankedProject,
} from "@/lib/pitch-vote";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitIdentity,
} from "@/lib/security/rate-limit";
import { createAdminSupabase, currentUser } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const fail = (error: string, status: number, extra: object = {}) =>
  Response.json({ error, ...extra }, { status, headers: NO_STORE });

export interface VoteState {
  open: boolean;
  closesAt: string;
  unavailable: boolean;
  signedIn: boolean;
  /** null when signed out, or when it could not be worked out. */
  eligible: boolean | null;
  /** The voter's current picks, in ballot order. */
  myVotes: string[];
  /** Only once voting has closed. */
  results: RankedProject[] | null;
  /** How many people voted — only once voting has closed. */
  voters: number | null;
}

export async function GET(request: NextRequest) {
  const closesAt = voteClosesAt();
  const open = voteOpen(new Date(), closesAt);
  const state: VoteState = {
    open,
    closesAt: closesAt.toISOString(),
    unavailable: false,
    signedIn: false,
    eligible: null,
    myVotes: [],
    results: null,
    voters: null,
  };
  const user = await currentUser();
  const limit = await rateLimit(
    RATE_LIMITS.voteRead,
    rateLimitIdentity(user?.id ?? null, request.headers),
  );
  if (!limit.allowed) {
    return fail("rate_limited", 429, { retryAfter: limit.retryAfterSeconds });
  }
  const db = createAdminSupabase();

  if (!open) {
    const { data, error } = await db.rpc("pitch_vote_stats");
    if (error) {
      if (!isMissingVoteSchema(error)) {
        console.error("[vote] stats failed", error.message);
      }
      state.unavailable = true;
    } else {
      const stats = parseVoteStats(data);
      if (stats) {
        state.results = rankTally(stats.tally, stats.voters);
        state.voters = stats.voters;
      }
    }
  }

  if (!user) return Response.json(state, { headers: NO_STORE });
  state.signedIn = true;

  const [eligible, mine] = await Promise.all([
    db.rpc("pitch_vote_eligible", { p_user_id: user.id }),
    db
      .from("pitch_votes")
      .select("project_id")
      .eq("user_id", user.id),
  ]);
  if (eligible.error || mine.error) {
    const error = (eligible.error ?? mine.error)!;
    if (isMissingVoteSchema(error)) {
      state.unavailable = true;
    } else {
      console.error("[vote] state failed", error.message);
    }
    return Response.json(state, { headers: NO_STORE });
  }
  state.eligible = Boolean(eligible.data);
  const picked = new Set((mine.data ?? []).map((r) => r.project_id));
  state.myVotes = PITCH_PROJECTS.map((p) => p.id).filter((id) => picked.has(id));
  return Response.json(state, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (
    !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
  ) {
    return fail("cross_origin", 403);
  }
  const user = await currentUser();
  if (!user) return fail("unauthenticated", 401);

  const limit = await rateLimit(
    RATE_LIMITS.vote,
    rateLimitIdentity(user.id, request.headers),
  );
  if (!limit.allowed) {
    return fail("rate_limited", 429, { retryAfter: limit.retryAfterSeconds });
  }

  if (!voteOpen(new Date())) return fail("vote_closed", 409);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body", 400);
  }
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) return fail("invalid_body", 400);

  const db = createAdminSupabase();
  const { data, error } = await db.rpc("set_pitch_votes", {
    p_user_id: user.id,
    p_project_ids: parsed.data.projectIds,
  });
  if (error) {
    if (isMissingVoteSchema(error)) return fail("vote_unavailable", 503);
    console.error("[vote] cast failed", error.message);
    return fail("vote_failed", 500);
  }
  const status = (data as { status?: string } | null)?.status;
  if (status === "not_eligible") return fail("not_eligible", 403);
  if (status === "too_many" || status === "duplicate") {
    return fail("invalid_body", 400);
  }
  if (status !== "saved") return fail("vote_failed", 500);
  return Response.json(
    { projectIds: parsed.data.projectIds },
    { headers: NO_STORE },
  );
}
