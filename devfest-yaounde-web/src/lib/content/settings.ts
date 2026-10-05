/**
 * Site settings — announcement + a few URLs.
 *
 * Null / missing row means "use the repo": `messages/*.json` for the
 * announcement, `src/lib/site-config.ts` for the URLs. Publishing from the
 * dashboard writes the single `site` row.
 */
import "server-only";
import { cache } from "react";
import {
  BEVY_URL,
  CFS_CLOSES_AT,
  CFS_OPENS_AT,
  CFS_URL,
  PARTICIPATION_TERMS_URL,
  PAST_GALLERY_URL,
  PRIVACY_POLICY_URL,
  SPONSOR_PROSPECTUS_URL,
  TERMS_URL,
} from "@/lib/site-config";
import { createAdminSupabase } from "@/lib/supabase/server";
import { toJson } from "@/lib/supabase/json";
import { EVENT_BASE_DATE } from "@/lib/calendar";
import { DEFAULT_NAV } from "@/lib/nav-tabs";
import { eventDateSchema, settingsSchema, type SettingsWrite } from "./schemas";

import type { AdminSettings } from "@/lib/admin/shape";

export type SiteSettings = AdminSettings;

const REPO_DEFAULTS: SiteSettings = {
  eventDate: EVENT_BASE_DATE!,
  announcement: null,
  bevyUrl: BEVY_URL,
  /* No backdrop until somebody uploads one — the hero's themed ground is a
     finished state, not a fallback waiting to be replaced. */
  hero: { imageUrl: "" },
  cfs: {
    url: CFS_URL,
    opensAt: CFS_OPENS_AT,
    closesAt: CFS_CLOSES_AT,
    override: "auto",
  },
  sponsorCall: {
    prospectusUrl: SPONSOR_PROSPECTUS_URL,
    enabled: true,
    closesAt: null,
  },
  legal: {
    participationTermsUrl: PARTICIPATION_TERMS_URL,
    privacyUrl: PRIVACY_POLICY_URL,
    termsUrl: TERMS_URL,
  },
  /* No overall capacity until an admin sets one — `null` total means "don't
     show a public counter", not "zero tickets left". */
  capacity: { total: null },
  memoryLane: { galleryUrl: PAST_GALLERY_URL, currentGalleryUrl: "" },
  /* Every tab shown until an admin hides one. */
  nav: DEFAULT_NAV,
  source: "repo",
};

/**
 * Merge a stored jsonb blob over the repo default.
 *
 * Field by field rather than wholesale: a settings row written before this
 * column existed, or written by a dashboard that only sent one key, must not
 * blank out the rest. Anything missing or the wrong type falls back.
 */
function merge<T extends object>(fallback: T, stored: unknown): T {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return fallback;
  }
  const source = stored as Record<string, unknown>;
  const out = { ...fallback };
  for (const key of Object.keys(fallback) as (keyof T)[]) {
    const value = source[key as string];
    if (value === undefined) continue;
    // `null` is meaningful for the nullable date fields — "no deadline" —
    // so it is kept, while a wrong type is not.
    if (value === null || typeof value === typeof fallback[key]) {
      out[key] = value as T[keyof T];
    }
  }
  return out;
}

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Per-request memo, not a cross-request cache.
 *
 * The layout and the page both need the settings now (the banner reads the
 * call for speakers), and React's `cache` collapses those into one query for
 * the duration of a single render. It deliberately does NOT survive the
 * request: a dashboard save must show on the very next load.
 */
export const loadSettings = cache(readSettings);

async function readSettings(): Promise<SiteSettings> {
  if (!supabaseConfigured()) return REPO_DEFAULTS;

  try {
    const db = createAdminSupabase();
    /*
      `*`, not a named column list — and that is a correctness choice, not
      laziness. Naming a column that does not exist yet makes PostgREST fail
      the WHOLE query (verified against the live project: "column
      site_settings.no_such_column does not exist"), and the error branch
      below then returns repo defaults for everything. So deploying code
      that reads a new column before its migration is applied would silently
      revert the live announcement, hero backdrop, call for speakers and
      prospectus at once. With `*`, a column that is not there yet is just
      absent from the row, and only its own group falls back.
    */
    const { data, error } = await db
      .from("site_settings")
      .select("*")
      .eq("id", "site")
      .maybeSingle();
    if (error || !data) return REPO_DEFAULTS;

    const announcement =
      data.announcement &&
      typeof data.announcement === "object" &&
      data.announcement !== null &&
      "fr" in data.announcement &&
      "en" in data.announcement
        ? {
            fr: String((data.announcement as { fr?: unknown }).fr ?? ""),
            en: String((data.announcement as { en?: unknown }).en ?? ""),
          }
        : null;

    // Hand-rolled rather than `merge()`: the fallback's `total` is `null`,
    // and `merge()`'s type-match rule (`typeof value === typeof fallback`)
    // never lets a real number through a `null` default — the same reason
    // `announcement` above isn't merged generically either.
    const capacityTotal =
      data.capacity &&
      typeof data.capacity === "object" &&
      "total" in data.capacity &&
      typeof (data.capacity as { total?: unknown }).total === "number"
        ? (data.capacity as { total: number }).total
        : null;

    return {
      eventDate: eventDateSchema.safeParse(data.event_date).success
        ? data.event_date!
        : REPO_DEFAULTS.eventDate,
      announcement,
      bevyUrl: data.bevy_url || BEVY_URL,
      hero: merge(REPO_DEFAULTS.hero, data.hero),
      cfs: merge(REPO_DEFAULTS.cfs, data.cfs),
      sponsorCall: merge(REPO_DEFAULTS.sponsorCall, data.sponsor_call),
      legal: merge(REPO_DEFAULTS.legal, data.legal),
      capacity: { total: capacityTotal },
      memoryLane: merge(REPO_DEFAULTS.memoryLane, data.memory_lane),
      // Key by key: a key missing from the stored blob is a tab that is SHOWN,
      // never one that is hidden by omission.
      nav: merge(REPO_DEFAULTS.nav, (data as { nav?: unknown }).nav),
      source: "database",
    };
  } catch (err) {
    console.warn("[settings] store unavailable, using repo", err);
    return REPO_DEFAULTS;
  }
}

export async function saveSettings(
  input: SettingsWrite,
  actor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_body" };
  }

  /*
    FOUND WHILE CHASING "the hero image uploaded but doesn't show": this write
    had `announcement` and `bevy_url` unconditional while every other field
    used the "only written when the caller sent it" spread below — the
    comment on that block even states the rule these two were breaking. The
    hero-image route calls this with `{ hero: {...} }` alone, so `undefined
    ? toJson(...) : null` for `announcement` silently wrote `null` over
    whatever announcement text was live, and `bevyUrl || null` did the same
    to the Bevy URL — every single hero upload, however unrelated. It did not
    cause the reported symptom (see `revalidateSettings`), but it is a real,
    separate loss of data and is fixed the same way as the rest of the row.
  */
  const db = createAdminSupabase();
  const { error } = await db.from("site_settings").upsert({
    id: "site",
    ...(parsed.data.eventDate !== undefined
      ? { event_date: parsed.data.eventDate }
      : {}),
    // Only written when the caller sent them. A dashboard form that edits the
    // announcement must not blank the call for speakers by omission — nor
    // may a photo upload blank the announcement.
    ...(parsed.data.announcement !== undefined
      ? {
          announcement: parsed.data.announcement
            ? toJson(parsed.data.announcement)
            : null,
        }
      : {}),
    ...(parsed.data.bevyUrl !== undefined
      ? { bevy_url: parsed.data.bevyUrl || null }
      : {}),
    ...(parsed.data.hero !== undefined
      ? { hero: parsed.data.hero ? toJson(parsed.data.hero) : null }
      : {}),
    ...(parsed.data.cfs !== undefined
      ? { cfs: parsed.data.cfs ? toJson(parsed.data.cfs) : null }
      : {}),
    ...(parsed.data.sponsorCall !== undefined
      ? {
          sponsor_call: parsed.data.sponsorCall
            ? toJson(parsed.data.sponsorCall)
            : null,
        }
      : {}),
    ...(parsed.data.legal !== undefined
      ? { legal: parsed.data.legal ? toJson(parsed.data.legal) : null }
      : {}),
    ...(parsed.data.capacity !== undefined
      ? { capacity: parsed.data.capacity ? toJson(parsed.data.capacity) : null }
      : {}),
    ...(parsed.data.memoryLane !== undefined
      ? {
          memory_lane: parsed.data.memoryLane
            ? toJson(parsed.data.memoryLane)
            : null,
        }
      : {}),
    ...(parsed.data.nav !== undefined
      ? { nav: parsed.data.nav ? toJson(parsed.data.nav) : null }
      : {}),
    updated_at: new Date().toISOString(),
    updated_by: actor,
  });

  if (error) {
    console.error("[settings] write failed", error.message);
    return { ok: false, error: "server_error" };
  }
  return { ok: true };
}
