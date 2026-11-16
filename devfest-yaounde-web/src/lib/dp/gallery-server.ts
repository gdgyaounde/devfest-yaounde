/**
 * The community wall, server side.
 *
 * Everything here exists because the wall publishes photographs of faces.
 * The rules are not stylistic:
 *
 *   - the bytes are validated by DECODING them, never by trusting a
 *     Content-Type header, which is a claim a browser makes;
 *   - they are re-encoded before anything is stored, so nothing a stranger
 *     supplied is ever served back;
 *   - cards publish on arrival unless DP_GALLERY_REVIEW=1 (ADR 0027);
 *   - the takedown token is stored as a hash, for the same reason a password
 *     is.
 *
 * Contract: docs/backend/dp-gallery-contract.md. Decision: ADR 0021.
 */
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminSupabase, currentUser } from "@/lib/supabase/server";
import { isCollectorFrameId } from "./frames";
import { getCollectorAccess } from "@/lib/tickets/entitlement";
import { isCollectorShapeId } from "./shapes";

/** Private on purpose: reads go through a signed URL that we mint per read. */
export const GALLERY_BUCKET = "dp-cards";

/** The client already downscales to 640px; this is the ceiling we enforce. */
export const MAX_EDGE = 800;
/**
 * Cap on the bytes ARRIVING, not the bytes stored.
 *
 * Raised when the wall moved to WebP: a browser that cannot encode WebP from
 * a canvas falls back to PNG, and a 640px PNG carrying a photograph is
 * comfortably over the old 400 KB. What actually lands in the bucket is the
 * re-encode below, which is far smaller — so this only has to be generous
 * enough not to punish an older Safari for its encoder.
 */
export const MAX_BYTES = 2 * 1024 * 1024;
const MAX_NICKNAME = 28;

/** How long a wall image URL stays valid. Long enough to render, not to hotlink. */
const SIGNED_URL_SECONDS = 600;

export type SubmitRejection =
  | "not_an_image"
  | "too_large"
  | "too_big_dimensions"
  | "bad_nickname"
  | "bad_locale"
  | "no_consent"
  /** A collector frame (ADR 0077) from somebody not entitled to it. */
  | "collector_locked";

export class GalleryRejected extends Error {
  constructor(readonly reason: SubmitRejection) {
    super(reason);
    this.name = "GalleryRejected";
  }
}

/**
 * A takedown token, and the hash we keep.
 *
 * The token is returned to the browser once and never stored. Anyone holding
 * it can remove that card; anyone holding the database cannot.
 */
export function mintDeletionToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time, so a wrong token cannot be narrowed down by timing. */
export function tokensMatch(
  candidateHash: string,
  storedHash: string,
): boolean {
  const a = Buffer.from(candidateHash);
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Validate and re-encode.
 *
 * The dimension check happens on the DECODED image, which is also what makes
 * the size cap real: a small file can still declare enormous dimensions, and
 * a `Content-Type` of `image/jpeg` is worth nothing on its own.
 *
 * Re-encoding strips every ancillary chunk as a side effect — EXIF included.
 * The client's canvas output should carry none anyway, but "should" is not a
 * guarantee about bytes that arrived over the network.
 */
export async function normaliseImage(file: Blob): Promise<Buffer> {
  if (file.size > MAX_BYTES) throw new GalleryRejected("too_large");

  const input = Buffer.from(await file.arrayBuffer());

  // Dynamic import: sharp is a native module and has no business loading on
  // a request that never touches the wall.
  const sharp = (await import("sharp")).default;

  let image;
  let meta;
  try {
    image = sharp(input, { failOn: "error" });
    meta = await image.metadata();
  } catch {
    throw new GalleryRejected("not_an_image");
  }

  if (!meta.width || !meta.height) throw new GalleryRejected("not_an_image");
  if (meta.width > MAX_EDGE || meta.height > MAX_EDGE) {
    throw new GalleryRejected("too_big_dimensions");
  }

  // Re-encode rather than pass through. `rotate()` with no argument applies
  // any EXIF orientation before it is discarded, so the picture keeps the way
  // up it was submitted.
  //
  // **WebP, and the transparency survives.** The corners of a card are fully
  // transparent by construction (geometry.ts draws inside a clipped rounded
  // rect). JPEG has no alpha channel, so storing one meant compositing those
  // corners onto something — and every encoder, sharp and browser canvas
  // alike, composites onto BLACK unless told otherwise. Flattening onto paper
  // hid that, but only by baking a colour into the card: any wall background other
  // than #F0F0F0 showed a pale rectangle behind every rounded corner.
  //
  // WebP carries alpha, so there is nothing to flatten and nothing to bake.
  // The card is stored exactly as it was composed and sits on whatever the
  // wall is painted, the way the PNG download always did.
  //
  // Quality rather than `lossless: true` on purpose: these are photographs,
  // and a lossless card runs several times larger for a difference nobody can
  // see on a wall tile — while `alphaQuality: 100` keeps the one channel that
  // actually has to be exact, because a soft alpha edge is a visible halo.
  return image
    .rotate()
    .webp({ quality: 92, alphaQuality: 100, effort: 4 })
    .toBuffer();
}

export function cleanNickname(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value.length > MAX_NICKNAME) {
    throw new GalleryRejected("bad_nickname");
  }
  return value;
}

export function cleanLocale(raw: FormDataEntryValue | null): "fr" | "en" {
  if (raw !== "fr" && raw !== "en") throw new GalleryRejected("bad_locale");
  return raw;
}

/**
 * Frame id from the generator. Empty is allowed (older clients).
 *
 * Shape only — whether a COLLECTOR frame id is allowed depends on who is
 * saving, so the route checks that separately (`requireCollectorEntitlement`).
 */
export function cleanTheme(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw.trim().slice(0, 40) : "";
  if (value && !/^[a-z0-9-]+$/i.test(value)) {
    throw new GalleryRejected("bad_nickname");
  }
  return value;
}

/**
 * Collector perks on the wall (ADR 0077, 0080): a collector frame, a
 * collector photo shape, or a typed badge. Each is refused unless the saver
 * is signed in AND holds a paid pass of their own, or is an admin. Without
 * this, anyone could post a card claiming them by sending the ids — the ids
 * are public; only the definitions are gated.
 *
 * The card itself is an image the client drew, so this checks what the
 * submission CLAIMS, which is all a server can check about a picture.
 */
export async function requireCollectorEntitlement(
  theme: string,
  extras: { shape?: string; customBadge?: boolean } = {},
): Promise<void> {
  const claimsPerk =
    isCollectorFrameId(theme) ||
    (extras.shape ? isCollectorShapeId(extras.shape) : false) ||
    extras.customBadge === true;
  if (!claimsPerk) return;
  const user = await currentUser().catch(() => null);
  if (!user) throw new GalleryRejected("collector_locked");
  const entitlement = await getCollectorAccess(user.id);
  if (!entitlement.entitled) throw new GalleryRejected("collector_locked");
}

/**
 * The consent, from the request.
 *
 * Only the FACT comes from the client. The wording is resolved server-side —
 * same rule as the refund acknowledgment (ADR 0022): a body that supplies its
 * own text could record agreement to something never shown.
 */
export function requireConsent(form: FormData): void {
  if (form.get("consent") !== "true") throw new GalleryRejected("no_consent");
}

/**
 * Where a new card lands.
 *
 * **Approved on arrival, by decision.** Asked for on 2026-09-03 and
 * reaffirmed: nobody should have to press anything for the wall to fill.
 * See ADR 0027 — it reverses the review-first rule of ADR 0026 and states
 * plainly what that costs.
 *
 * Setting `DP_GALLERY_REVIEW=1` puts the queue back, without a code change.
 */
export function initialStatus(): "approved" | "pending" {
  return process.env.DP_GALLERY_REVIEW === "1" ? "pending" : "approved";
}

/**
 * Storage path. Generated id, never the nickname — that is user input.
 *
 * `.webp` since the format change. Rows written before it keep their `.jpg`
 * path in the database and go on resolving: the extension is whatever was
 * stored, not something recomputed at read time.
 */
export function storagePath(id: string): string {
  return `${new Date().getFullYear()}/${id}.webp`;
}

export async function storeCard(path: string, bytes: Buffer): Promise<void> {
  const supabase = createAdminSupabase();
  const { error } = await supabase.storage
    .from(GALLERY_BUCKET)
    .upload(path, bytes, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`could not store the card: ${error.message}`);
}

/**
 * Remove the object.
 *
 * Called on rejection as well as takedown: a rejected face sitting in a
 * bucket is exactly the harm the review was meant to prevent.
 */
export async function removeCard(path: string): Promise<void> {
  const supabase = createAdminSupabase();
  const { error } = await supabase.storage.from(GALLERY_BUCKET).remove([path]);
  if (error)
    console.warn("[dp-gallery] could not remove object", error.message);
}

/** How many cards one page of the wall carries. */
export const WALL_PAGE_SIZE = 24;

export interface WallPage {
  cards: { id: string; nickname: string; imageUrl: string }[];
  page: number;
  hasMore: boolean;
}

/**
 * One page of the wall, read straight from the database.
 *
 * Extracted so the PAGE and the API route share it. The page used to fetch
 * its own API route over HTTP — `fetch(NEXT_PUBLIC_APP_BASE_URL + "/api/...")`
 * — which is a server calling itself across the network to reach a function
 * it already has. That was not merely wasteful: when the self-call failed for
 * any reason (a cold start, a base URL that is wrong on a preview
 * deployment), the wall rendered with zero cards and looked broken until
 * someone reloaded. There is no network hop left to fail.
 *
 * Shuffled by default so an early submission is not buried under a late rush.
 */
export async function readWallPage(
  page = 0,
  shuffle = true,
): Promise<WallPage> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("dp_cards")
    .select("id, nickname, storage_path, created_at")
    .eq("status", "approved")
    .eq("visible", true)
    .order("created_at", { ascending: false })
    .range(page * WALL_PAGE_SIZE, page * WALL_PAGE_SIZE + WALL_PAGE_SIZE - 1);

  if (error) {
    console.error("[dp-gallery] read failed", error.message);
    throw new Error(error.message);
  }

  const rows = data ?? [];
  if (shuffle) {
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
  }

  // No IP, no consent timestamps, no tokens — the contract is explicit.
  const cards = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      nickname: row.nickname,
      imageUrl: await signedUrl(row.storage_path),
    })),
  );

  return {
    cards: cards.filter(
      (card): card is { id: string; nickname: string; imageUrl: string } =>
        Boolean(card.imageUrl),
    ),
    page,
    hasMore: rows.length === WALL_PAGE_SIZE,
  };
}

/** A short-lived URL for one approved card. */
export async function signedUrl(path: string): Promise<string | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.storage
    .from(GALLERY_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) {
    console.warn("[dp-gallery] could not sign", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
