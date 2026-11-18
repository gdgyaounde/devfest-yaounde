/**
 * /api/interests — "This interests me" (ADR 0086).
 *
 *   GET   → { signedIn, sessionIds: string[] }   (the caller's own)
 *   POST  { sessionId, interested } → { sessionIds }
 *
 * Signed-in only, same-origin only, rate-limited per account. The session id
 * must exist on the schedule, and an account is capped at MAX_INTERESTS.
 *
 * Fails CLOSED and quiet: before migration 0038 the table does not exist, GET
 * answers an empty list and POST answers 503 `interests_unavailable`.
 */
import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { getSessions } from "@/lib/content/store";
import {
  interestSchema,
  knownSession,
  MAX_INTERESTS,
} from "@/lib/interests/rules";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitIdentity,
} from "@/lib/security/rate-limit";
import { createAdminSupabase, currentUser } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const fail = (error: string, status: number, extra: object = {}) =>
  Response.json({ error, ...extra }, { status, headers: NO_STORE });

async function mine(userId: string): Promise<string[] | null> {
  const { data, error } = await createAdminSupabase()
    .from("session_interests")
    .select("session_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(MAX_INTERESTS + 1);
  if (error) {
    console.error("[interests] read failed", error.message);
    return null;
  }
  return (data ?? []).map((r) => r.session_id);
}

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return Response.json(
      { signedIn: false, sessionIds: [] },
      { headers: NO_STORE },
    );
  }
  const ids = await mine(user.id);
  return Response.json(
    { signedIn: true, sessionIds: ids ?? [] },
    { headers: NO_STORE },
  );
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
    RATE_LIMITS.interest,
    rateLimitIdentity(user.id, request.headers),
  );
  if (!limit.allowed) {
    return fail("rate_limited", 429, { retryAfter: limit.retryAfterSeconds });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_body", 400);
  }
  const parsed = interestSchema.safeParse(body);
  if (!parsed.success) return fail("invalid_body", 400);
  const { sessionId, interested } = parsed.data;

  const supabase = createAdminSupabase();

  if (interested) {
    if (!knownSession(sessionId, await getSessions())) {
      return fail("unknown_session", 404);
    }
    const current = await mine(user.id);
    if (current === null) return fail("interests_unavailable", 503);
    if (!current.includes(sessionId) && current.length >= MAX_INTERESTS) {
      return fail("too_many", 409);
    }
    const { error } = await supabase
      .from("session_interests")
      .upsert(
        { user_id: user.id, session_id: sessionId },
        { onConflict: "user_id,session_id", ignoreDuplicates: true },
      );
    if (error) {
      console.error("[interests] save failed", error.message);
      return fail("interests_unavailable", 503);
    }
  } else {
    const { error } = await supabase
      .from("session_interests")
      .delete()
      .eq("user_id", user.id)
      .eq("session_id", sessionId);
    if (error) {
      console.error("[interests] remove failed", error.message);
      return fail("interests_unavailable", 503);
    }
  }

  const ids = await mine(user.id);
  return Response.json({ sessionIds: ids ?? [] }, { headers: NO_STORE });
}
