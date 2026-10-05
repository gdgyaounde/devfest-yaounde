/**
 * GET /api/cron/cleanup — housekeeping, run on a schedule.
 *
 * Five jobs, and the first is the important one:
 *   1. RECONCILE. Ask PawaPay about every pending deposit and settle the ones
 *      that completed. With no callback available to this app (ADR 0019),
 *      this is what catches the payment whose buyer closed the tab.
 *   2. Fail intents that were never paid. Not cosmetic: a pending intent
 *      holds tier capacity and a discount redemption, so leaving them around
 *      slowly makes a tier look sold out when it is not.
 *   3. Drop rate-limit counters whose window has long passed.
 *   4. Purge wall cards past their retention — 200 days (ADR 0026).
 *   5. Force the home page to rebuild once the event ends (ADR 0058). Every
 *      public page is static and only regenerates on an explicit
 *      `revalidatePath`, so without this the hero would keep selling
 *      tickets to a event that already happened until some unrelated admin
 *      edit happened to revalidate `/`. Bounded to the first day after the
 *      event ends — see `withinPostEventRevalidateWindow`.
 *
 * Protected by a shared secret rather than a session, because the caller is
 * a scheduler, not a person. The five-minute knock comes from Supabase
 * pg_cron (ADR 0028); Vercel Cron is a once-a-day Hobby-legal backstop.
 * Without `CRON_SECRET` set the route refuses outright — an unauthenticated
 * endpoint that mutates payment state is not something to leave open.
 */
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { logPaymentEvent } from "@/lib/payments/intents";
import { reconcilePendingDeposits } from "@/lib/payments/reconcile";
import { purgeExpiredCards } from "@/lib/dp/gallery-retention";
import { loadSettings } from "@/lib/content/settings";
import { withinPostEventRevalidateWindow } from "@/lib/event";

/** Comfortably past the reservation window, so nothing live is touched. */
const STALE_INTENT_SECONDS = 3600;
const RATE_LIMIT_RETENTION_SECONDS = 86_400;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Both schedulers send `Authorization: Bearer <CRON_SECRET>` — Vercel Cron
  // (daily backstop) and Supabase pg_cron via pg_net (the five-minute sweep).
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // Reconcile BEFORE expiring: a deposit that completed a minute before the
  // expiry threshold must be delivered, not failed.
  const reconciled = await reconcilePendingDeposits();

  const supabase = createAdminSupabase();

  const { data: expired, error: expireError } = await supabase.rpc(
    "expire_stale_intents",
    { p_older_than_seconds: STALE_INTENT_SECONDS },
  );

  const { data: pruned, error: pruneError } = await supabase.rpc(
    "cleanup_rate_limits",
    { p_older_than_seconds: RATE_LIMIT_RETENTION_SECONDS },
  );

  if (expireError || pruneError) {
    console.error("[cron/cleanup] failed", {
      expire: expireError?.message,
      prune: pruneError?.message,
    });
    return Response.json({ error: "cleanup_failed" }, { status: 500 });
  }

  // Retention runs last: it touches no money, and a failure here must not
  // stop a payment from being settled.
  const wall = await purgeExpiredCards();

  // Cheapest job here by far — this only marks a cache entry stale, it does
  // not touch the database — so it runs unconditionally inside the window
  // rather than trying to detect the exact tick the boundary was crossed.
  const settings = await loadSettings();
  const revalidatedHome = withinPostEventRevalidateWindow(new Date(), [
    settings.eventDate,
  ]);
  if (revalidatedHome) revalidatePath("/", "layout");

  const result = {
    reconciled,
    wall,
    expiredIntents: Number(expired ?? 0),
    prunedRateLimits: Number(pruned ?? 0),
    revalidatedHome,
  };

  // Only worth an audit line when it actually did something.
  if (result.expiredIntents > 0) {
    await logPaymentEvent(null, "intents_expired", result);
  }

  return Response.json(result);
}
