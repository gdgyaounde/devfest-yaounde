/**
 * DP generator — saving a composed card to the community wall.
 *
 * Download, share and copy stash a smaller copy first, then do the action
 * (ADR 0034). The source photo never uploads. The wall is on unless the
 * deployment sets `NEXT_PUBLIC_DP_GALLERY=0`.
 */

/**
 * Longest edge of the copy that gets uploaded.
 *
 * A wall thumbnail does not need 1080, let alone 2160. 640 keeps a card
 * legible at the size a grid actually shows it, and cuts what leaves the
 * device — and what has to be stored, served and moderated — by roughly
 * thirty times.
 */
export const GALLERY_MAX_EDGE = 640;

/**
 * WebP, and nothing is flattened.
 *
 * A card with rounded or mixed corners (`geometry.ts`) is drawn INSIDE a
 * clipped rounded rect, so its four corners are fully transparent. JPEG has
 * no alpha channel: encoding one meant compositing those corners onto
 * something, and a canvas composites onto BLACK unless filled first. That is
 * why the download (a PNG) looked right and the wall copy did not — the two
 * were different formats, and only one of them could carry the corners.
 *
 * WebP carries alpha. Nothing is filled, nothing is baked in, and the card
 * reaching the wall is the card that was composed.
 *
 * A browser too old to encode WebP from a canvas returns a PNG instead
 * (`toBlob` falls back on an unsupported type). That is fine and deliberate:
 * PNG also carries alpha, the server re-encodes either one to WebP, and the
 * incoming size cap is set high enough to accept it.
 */
const GALLERY_TYPE = "image/webp";
const GALLERY_QUALITY = 0.92;

/** Where a deletion token is kept so someone can take their card down. */
export const GALLERY_TOKENS_KEY = "devfest-dp-gallery";

export type GalleryError =
  | "gallery_disabled"
  | "gallery_rate_limited"
  | "gallery_rejected"
  | "gallery_failed";

export class GallerySubmitError extends Error {
  constructor(readonly code: GalleryError) {
    super(code);
    this.name = "GallerySubmitError";
  }
}

/**
 * Is the wall live?
 *
 * Read from a build-time public flag rather than probed at runtime: probing
 * would mean a request on every page load to discover a feature that is off,
 * and a flag is what the deployment already knows.
 */
export function galleryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DP_GALLERY === "1";
}

/**
 * The lighter copy that gets uploaded.
 *
 * Re-encoding through a canvas has a property worth stating plainly: the
 * result carries NO EXIF. The original's GPS coordinates, camera serial and
 * capture time cannot reach the server, because they were never in the
 * pixels — the compositor drew from a bitmap, not from the file. That is a
 * consequence of how the card is made, not a filter someone has to remember
 * to apply.
 */
export async function galleryCopy(card: Blob): Promise<Blob> {
  const source = await createImageBitmap(card);
  const scale = Math.min(
    1,
    GALLERY_MAX_EDGE / Math.max(source.width, source.height),
  );
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.imageSmoothingQuality = "high";
    // No fill: the canvas starts transparent and WebP keeps it that way.
    ctx.drawImage(source, 0, 0, w, h);
    source.close();
    return canvas.convertToBlob({
      type: GALLERY_TYPE,
      quality: GALLERY_QUALITY,
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  // No fill — see above.
  ctx.drawImage(source, 0, 0, w, h);
  source.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("no blob"))),
      GALLERY_TYPE,
      GALLERY_QUALITY,
    );
  });
}

export interface GallerySubmission {
  id: string;
  deletionToken: string;
  status: "approved" | "pending";
}

export interface GalleryToken {
  id: string;
  token: string;
}

/**
 * Stash the composed card. Throws on a hard failure so a caller that cares
 * can show it; `stashComposedCard` swallows those so a download still runs.
 */
export async function submitToGallery(input: {
  card: Blob;
  nickname: string;
  locale: "fr" | "en";
  theme?: string;
  /** A collector photo shape id (ADR 0080), if one was used. */
  shape?: string;
  /** Whether the badge text was typed rather than picked (ADR 0080). */
  customBadge?: boolean;
}): Promise<GallerySubmission> {
  if (!galleryEnabled()) throw new GallerySubmitError("gallery_disabled");

  const body = new FormData();
  body.set("image", await galleryCopy(input.card), "card.webp");
  body.set(
    "nickname",
    (
      input.nickname.trim() || (input.locale === "fr" ? "quelqu'un" : "someone")
    ).slice(0, 28),
  );
  body.set("locale", input.locale);
  body.set("consent", "true");
  body.set("consentAt", new Date().toISOString());
  if (input.theme) body.set("theme", input.theme);
  if (input.shape) body.set("shape", input.shape);
  if (input.customBadge) body.set("customBadge", "true");

  let response: Response;
  try {
    response = await fetch("/api/dp/gallery", { method: "POST", body });
  } catch {
    throw new GallerySubmitError("gallery_failed");
  }

  if (response.status === 429)
    throw new GallerySubmitError("gallery_rate_limited");
  if (response.status === 422) throw new GallerySubmitError("gallery_rejected");
  if (!response.ok) throw new GallerySubmitError("gallery_failed");

  const data = (await response.json().catch(() => null)) as {
    id?: string;
    deletionToken?: string;
    status?: "approved" | "pending";
  } | null;
  if (!data?.deletionToken || !data.id) {
    throw new GallerySubmitError("gallery_failed");
  }

  rememberToken(data.id, data.deletionToken);
  return {
    id: data.id,
    deletionToken: data.deletionToken,
    status: data.status === "pending" ? "pending" : "approved",
  };
}

/**
 * Save-on-action: never blocks Download / Share / Copy. Hands back the
 * submission (so the generator can replace it later — ADR 0081), or null
 * when nothing was stored.
 */
export async function stashComposedCard(input: {
  card: Blob;
  nickname: string;
  locale: "fr" | "en";
  theme?: string;
  shape?: string;
  customBadge?: boolean;
}): Promise<GallerySubmission | null> {
  try {
    return await submitToGallery(input);
  } catch (err) {
    console.warn("[dp] wall stash skipped", err);
    return null;
  }
}

export async function reportGalleryCard(id: string): Promise<void> {
  if (!galleryEnabled()) throw new GallerySubmitError("gallery_disabled");

  let response: Response;
  try {
    response = await fetch(`/api/dp/gallery/${id}/report`, { method: "POST" });
  } catch {
    throw new GallerySubmitError("gallery_failed");
  }

  if (response.status === 429)
    throw new GallerySubmitError("gallery_rate_limited");
  if (!response.ok) throw new GallerySubmitError("gallery_failed");
}

export function loadGalleryTokens(): GalleryToken[] {
  try {
    const raw = window.localStorage.getItem(GALLERY_TOKENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (
        item &&
        typeof item === "object" &&
        "id" in item &&
        "token" in item &&
        typeof (item as GalleryToken).id === "string" &&
        typeof (item as GalleryToken).token === "string"
      ) {
        return [item as GalleryToken];
      }
      return [];
    });
  } catch {
    return [];
  }
}

export async function takeDownCard(
  id: string,
  token: string,
): Promise<boolean> {
  const response = await fetch(`/api/dp/gallery/${id}`, {
    method: "DELETE",
    headers: { "X-Deletion-Token": token },
  });
  if (response.ok) forgetGalleryToken(id);
  return response.ok;
}

function rememberToken(id: string, token: string) {
  try {
    const list = loadGalleryTokens().filter((row) => row.id !== id);
    window.localStorage.setItem(
      GALLERY_TOKENS_KEY,
      JSON.stringify([...list, { id, token }].slice(-20)),
    );
  } catch {
    // Private mode: the submission still stands, the takedown shortcut does not.
  }
}

function forgetGalleryToken(id: string) {
  try {
    window.localStorage.setItem(
      GALLERY_TOKENS_KEY,
      JSON.stringify(loadGalleryTokens().filter((row) => row.id !== id)),
    );
  } catch {
    /* ignore */
  }
}
