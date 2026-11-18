/**
 * Organiser photo uploads for editorial collections.
 *
 * The public site shows these pictures, so the bucket is public. The bytes
 * are still decoded and re-encoded — a Content-Type header is a claim, and
 * EXIF can leak a location from a speaker's phone.
 */
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { CollectionId } from "./schemas";

export const EDITORIAL_BUCKET = "editorial";

/** Incoming file cap. Re-encoding usually lands well under this. */
export const PHOTO_MAX_BYTES = 2.5 * 1024 * 1024;
/** Longest edge after decode. Speaker cards crop; 1600 is plenty. */
export const PHOTO_MAX_EDGE = 1600;

export type PhotoKind = "url" | "images";

export interface PhotoField {
  kind: PhotoKind;
  field: string;
}

/** Collections that have a picture the organiser attaches by hand. */
export const PHOTO_FIELDS: Partial<Record<CollectionId, PhotoField>> = {
  speakers: { kind: "url", field: "photoUrl" },
  team: { kind: "url", field: "photoUrl" },
  sponsors: { kind: "url", field: "logoUrl" },
  products: { kind: "images", field: "images" },
  "past-editions": { kind: "url", field: "imageUrl" },
  quotes: { kind: "url", field: "avatarUrl" },
  stats: { kind: "url", field: "imageUrl" },
};

export function isPhotoCollection(id: string): id is keyof typeof PHOTO_FIELDS {
  return id in PHOTO_FIELDS;
}

export class PhotoRejected extends Error {
  constructor(
    readonly reason: "not_an_image" | "too_large" | "too_big_dimensions",
  ) {
    super(reason);
    this.name = "PhotoRejected";
  }
}

export function isPlaceholderPhoto(url: unknown): boolean {
  if (typeof url !== "string") return true;
  const value = url.trim();
  if (!value || value === "#" || value.startsWith("javascript:")) return true;
  return value.includes("/placeholders/");
}

export function entryNeedsPhoto(
  entry: Record<string, unknown>,
  spec: PhotoField,
): boolean {
  if (spec.kind === "images") {
    const images = entry[spec.field];
    if (!Array.isArray(images) || images.length === 0) return true;
    return isPlaceholderPhoto(images[0]);
  }
  return isPlaceholderPhoto(entry[spec.field]);
}

/**
 * The two formats `normalisePhoto` can produce, and the extension/content
 * type each is stored and served as. See `normalisePhoto`'s doc comment for
 * which one a given upload gets and why.
 */
export type PhotoFormat = "jpeg" | "webp";

const PHOTO_EXTENSION: Record<PhotoFormat, "jpg" | "webp"> = {
  jpeg: "jpg",
  webp: "webp",
};

export const PHOTO_CONTENT_TYPE: Record<
  PhotoFormat,
  "image/jpeg" | "image/webp"
> = {
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function publicPhotoUrl(
  collection: CollectionId,
  entryId: string,
  format: PhotoFormat = "jpeg",
): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const path = storagePath(collection, entryId, format);
  return `${base}/storage/v1/object/public/${EDITORIAL_BUCKET}/${path}?v=${Date.now()}`;
}

export function storagePath(
  collection: CollectionId,
  entryId: string,
  format: PhotoFormat = "jpeg",
): string {
  return `${collection}/${entryId}.${PHOTO_EXTENSION[format]}`;
}

/**
 * Public URL for an arbitrary path in the editorial bucket.
 *
 * `publicPhotoUrl` above is this same construction, narrowed to one
 * `<collection>/<entryId>.jpg` shape. The staged multi-image uploader
 * (swag items, product galleries) stores several files under a caller-chosen
 * folder instead, so it needs the general form.
 */
export function publicStorageUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${EDITORIAL_BUCKET}/${path}`;
}

/**
 * A caller-chosen folder for staged uploads — letters, digits, `-`/`_`/`/`
 * only, no leading/trailing/doubled slashes, no `..`. Rejects anything else
 * rather than sanitising it, since this becomes a Supabase Storage key.
 */
export function isSafeUploadPath(path: string): boolean {
  if (!path || path.length > 200) return false;
  if (path.includes("..") || path.startsWith("/") || path.endsWith("/")) {
    return false;
  }
  return /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i.test(path);
}

export interface NormalisedPhoto {
  bytes: Buffer;
  format: PhotoFormat;
}

/**
 * Decode, re-encode, resize — and the ALPHA BUG this used to have.
 *
 * This unconditionally encoded JPEG, which has no alpha channel. Verified
 * directly (not assumed): feeding sharp a PNG with a genuinely transparent
 * region and encoding it as JPEG turns that region **solid black** —
 * `(0,0,0)` at every formerly-transparent pixel, sampled back from the raw
 * output. That is the sponsor-logo bug — a logo with a cut-out background
 * came out with a black rectangle behind it — and it was silent, because
 * every OTHER upload here (speaker/team portraits, product shots) is a
 * normal opaque photo, where losing an alpha channel that was never doing
 * anything is invisible.
 *
 * The fix reads the SOURCE's own alpha channel and only changes format for
 * images that actually use it: `meta.hasAlpha` true → WebP, with
 * `alphaQuality: 100` (verified: alpha sampled back as `0` exactly, not
 * merely "low but nonzero") — same treatment `normaliseBackdrop` already
 * gives the hero image, for the same reason. Otherwise: JPEG, unchanged,
 * because there is nothing an alpha channel would have preserved and JPEG
 * is smaller at the same visual quality.
 *
 * Callers must store and serve the result under the extension/content-type
 * `format` implies (see `storagePath`/`publicPhotoUrl`/`PHOTO_CONTENT_TYPE`)
 * — the two are chosen together and must not drift apart.
 */
export async function normalisePhoto(file: Blob): Promise<NormalisedPhoto> {
  if (file.size > PHOTO_MAX_BYTES) throw new PhotoRejected("too_large");

  const input = Buffer.from(await file.arrayBuffer());
  const sharp = (await import("sharp")).default;

  let image;
  let meta;
  try {
    image = sharp(input, { failOn: "error" });
    meta = await image.metadata();
  } catch {
    throw new PhotoRejected("not_an_image");
  }

  if (!meta.width || !meta.height) throw new PhotoRejected("not_an_image");
  if (meta.width > 8000 || meta.height > 8000) {
    throw new PhotoRejected("too_big_dimensions");
  }

  const resized = image.rotate().resize({
    width: PHOTO_MAX_EDGE,
    height: PHOTO_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (meta.hasAlpha) {
    const bytes = await resized
      .webp({ quality: 85, alphaQuality: 100 })
      .toBuffer();
    return { bytes, format: "webp" };
  }

  const bytes = await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  return { bytes, format: "jpeg" };
}

/**
 * Best-effort cleanup for the OTHER extension a re-upload didn't use this
 * time. Storage `remove()` on a path that isn't there is not an error worth
 * surfacing — it's the expected result for every entry's first upload — so
 * failures here are logged and swallowed rather than propagated: a stray
 * unused file is a storage-cost annoyance, never a correctness problem, and
 * must not be allowed to fail the upload it is tidying up after.
 */
export async function deletePhotoIfExists(path: string): Promise<void> {
  const supabase = createAdminSupabase();
  const { error } = await supabase.storage
    .from(EDITORIAL_BUCKET)
    .remove([path]);
  if (error) {
    console.warn(
      "[content/photos] stale-file cleanup failed",
      path,
      error.message,
    );
  }
}

export async function storePhoto(
  path: string,
  bytes: Buffer,
  /*
   * Callers should pass `PHOTO_CONTENT_TYPE[format]` from whatever
   * `normalisePhoto`/`normaliseBackdrop` returned — the default here exists
   * only for call sites that never had a choice to make (there aren't any
   * left; kept so this stays a safe, non-breaking signature).
   */
  contentType: "image/jpeg" | "image/webp" = "image/jpeg",
): Promise<void> {
  const supabase = createAdminSupabase();
  const { error } = await supabase.storage
    .from(EDITORIAL_BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });
  if (error) throw new Error(`could not store the photo: ${error.message}`);
}

export function applyPhotoUrl(
  entry: Record<string, unknown>,
  spec: PhotoField,
  url: string,
): Record<string, unknown> {
  if (spec.kind === "images") {
    const images = Array.isArray(entry[spec.field])
      ? [...(entry[spec.field] as unknown[])]
      : [];
    if (images.length === 0) images.push(url);
    else images[0] = url;
    return { ...entry, [spec.field]: images };
  }
  return { ...entry, [spec.field]: url };
}

/** A backdrop is seen at full width, so it gets more pixels than a portrait. */
export const BACKDROP_MAX_EDGE = 2400;

/**
 * The hero backdrop, normalised — and the one place JPEG would be wrong.
 *
 * `normalisePhoto` above encodes JPEG, which has no alpha channel: every
 * transparent pixel comes out as a flat colour chosen by the encoder. For a
 * speaker's portrait that is fine and smaller. For the hero it destroys the
 * thing the backdrop is for — a PNG with a cut-out subject is supposed to let
 * the themed ground show through it, and JPEG would replace that ground with
 * a hard rectangle of black or white (the same class of bug ADR 0037 fixed on
 * the community wall).
 *
 * So: **WebP, with `alphaQuality` high enough to keep a clean edge.** It also
 * happens to be smaller than JPEG at the same quality, which matters more
 * here than anywhere else on the site — this image is full-bleed.
 *
 * Larger, too. 1600px is generous for a card and thin for a backdrop stretched
 * across a 2560px monitor.
 */
export async function normaliseBackdrop(file: Blob): Promise<Buffer> {
  if (file.size > PHOTO_MAX_BYTES) throw new PhotoRejected("too_large");

  const input = Buffer.from(await file.arrayBuffer());
  const sharp = (await import("sharp")).default;

  let image;
  let meta;
  try {
    image = sharp(input, { failOn: "error" });
    meta = await image.metadata();
  } catch {
    throw new PhotoRejected("not_an_image");
  }

  if (!meta.width || !meta.height) throw new PhotoRejected("not_an_image");
  if (meta.width > 8000 || meta.height > 8000) {
    throw new PhotoRejected("too_big_dimensions");
  }

  return image
    .rotate()
    .resize({
      width: BACKDROP_MAX_EDGE,
      height: BACKDROP_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, alphaQuality: 100, effort: 4 })
    .toBuffer();
}

/**
 * Where the backdrop lives. One path, overwritten on every upload, with a
 * cache-buster on the URL — there is only ever one hero image, and keeping
 * previous ones would be a gallery nobody asked for.
 */
export const BACKDROP_PATH = "hero/backdrop.webp";

export function publicBackdropUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${EDITORIAL_BUCKET}/${BACKDROP_PATH}?v=${Date.now()}`;
}
