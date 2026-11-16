/**
 * GET /api/dp/collector-frames — the collector DP frame definitions, for
 * paid pass holders only (ADR 0077).
 *
 *   signed out          → 401 { entitled: false }
 *   signed in, no paid  → 403 { entitled: false }
 *   paid pass holder    → 200 { entitled: true, tierName, frames }
 *
 * The generator fetches this lazily and never waits on it (ADR 0015/0034:
 * the DP generator stays usable with no sign-in). Never cached — the answer
 * is about one person.
 */
import { NextRequest } from "next/server";
import { collectorFrames } from "@/lib/dp/collector-frames";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitIdentity,
} from "@/lib/security/rate-limit";
import { currentUser } from "@/lib/supabase/server";
import { getCollectorAccess } from "@/lib/tickets/entitlement";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const user = await currentUser().catch(() => null);
  if (!user) {
    return Response.json(
      { entitled: false },
      { status: 401, headers: NO_STORE },
    );
  }
  const limit = await rateLimit(
    RATE_LIMITS.dpCollector,
    rateLimitIdentity(user.id, request.headers),
  );
  if (!limit.allowed) {
    return Response.json(
      { entitled: false, error: "rate_limited" },
      { status: 429, headers: NO_STORE },
    );
  }
  // Paid pass holders, and admins (ADR 0077).
  const entitlement = await getCollectorAccess(user.id);
  if (!entitlement.entitled) {
    return Response.json(
      { entitled: false },
      { status: 403, headers: NO_STORE },
    );
  }
  return Response.json(
    {
      entitled: true,
      tierName: entitlement.tierName,
      frames: collectorFrames(entitlement.tierName ?? ""),
    },
    { headers: NO_STORE },
  );
}
