/**
 * The community wall.
 *
 *   POST — submit a card. No authentication: the generator has no account,
 *          by design (ADR 0015). Rate-limited by IP instead.
 *   GET  — read the wall. Approved cards only.
 *
 * Contract: docs/backend/dp-gallery-contract.md.
 *
 * The order of the POST checks is deliberate and comes from the contract:
 * rate limit, then consent, then the bytes, then storage, then the row. The
 * expensive work (decoding and re-encoding an image) happens only after the
 * cheap refusals, so flooding this endpoint costs the attacker more than it
 * costs us.
 */
import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { clientIp } from "@/lib/pawapay/verify";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import {
  GalleryRejected,
  cleanLocale,
  cleanNickname,
  cleanTheme,
  requireCollectorEntitlement,
  mintDeletionToken,
  normaliseImage,
  removeCard,
  requireConsent,
  initialStatus,
  readWallPage,
  storagePath,
  storeCard,
} from "@/lib/dp/gallery-server";
import { galleryConsentText } from "@/lib/dp/gallery-consent";

function enabled(): boolean {
  return process.env.NEXT_PUBLIC_DP_GALLERY === "1";
}

export async function POST(request: NextRequest) {
  // The flag gates the server too, not just the button. Otherwise the wall is
  // reachable by anyone who reads the source while the team believes it off.
  if (!enabled()) {
    return Response.json({ error: "gallery_disabled" }, { status: 404 });
  }

  const ip = clientIp(request.headers) ?? "unknown";
  const limit = await rateLimit(RATE_LIMITS.dpGallery, `ip:${ip}`);
  if (!limit.allowed) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 422 });
  }

  let nickname: string;
  let locale: "fr" | "en";
  let theme: string;
  let bytes: Buffer;
  try {
    requireConsent(form);
    nickname = cleanNickname(form.get("nickname"));
    locale = cleanLocale(form.get("locale"));
    theme = cleanTheme(form.get("theme"));
    await requireCollectorEntitlement(theme);

    const image = form.get("image");
    if (!(image instanceof Blob)) throw new GalleryRejected("not_an_image");
    bytes = await normaliseImage(image);
  } catch (err) {
    if (err instanceof GalleryRejected) {
      return Response.json({ error: err.reason }, { status: 422 });
    }
    console.error("[dp-gallery] submit failed", err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }

  const supabase = createAdminSupabase();
  const { token, hash } = mintDeletionToken();
  const status = initialStatus();
  const id = crypto.randomUUID();
  const path = storagePath(id);

  try {
    await storeCard(path, bytes);
  } catch (err) {
    console.error("[dp-gallery] storage failed", err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }

  const { error } = await supabase.from("dp_cards").insert({
    id,
    storage_path: path,
    nickname,
    locale,
    consent: true,
    consent_at: new Date().toISOString(),
    // Resolved here, never taken from the body: the record has to say what
    // the person was actually shown (same rule as ADR 0022).
    consent_text: galleryConsentText(locale),
    status,
    // Auto-approved cards carry no reviewer: nobody looked, and the record
    // should not suggest otherwise.
    reviewed_at: status === "approved" ? new Date().toISOString() : null,
    deletion_hash: hash,
    submitter_ip: ip === "unknown" ? null : ip,
    theme,
    visible: true,
  });

  if (error) {
    // Do not leave an orphan object behind a failed row.
    await removeCard(path);
    console.error("[dp-gallery] insert failed", error.message);
    return Response.json({ error: "server_error" }, { status: 500 });
  }

  // 201 with the token, exactly once. Only its hash is kept.
  // The status is whatever actually happened — auto-approved or queued —
  // so the screen can tell the truth (ADR 0027).
  return Response.json({ id, deletionToken: token, status }, { status: 201 });
}

export async function GET(request: NextRequest) {
  if (!enabled()) {
    return Response.json({ error: "gallery_disabled" }, { status: 404 });
  }

  const url = request.nextUrl;
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
  // The wall shows cards shuffled rather than newest-first, so an early
  // submission is not buried by a late rush. `newest` stays available.
  const shuffle = url.searchParams.get("order") !== "newest";

  try {
    // Same reader the page uses. One definition of "what is on the wall".
    return Response.json(await readWallPage(page, shuffle));
  } catch {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
