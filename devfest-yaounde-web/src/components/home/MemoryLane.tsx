import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { getLocale, getTranslations } from "next-intl/server";
import { isPlaceholderUrl, RECAP_URL } from "@/lib/site-config";
import { EVENT, PAST_GALLERY_YEAR, eventHasEnded } from "@/lib/event";
import { MorphedImageFrame } from "@/components/ui/MorphedImageFrame";
import { ScrollStage } from "@/components/ui/ScrollStage";
import { SectionContainer } from "@/components/ui/SectionContainer";
import type { PastEditionPhoto } from "@/data/types";
import { getPastEditions } from "@/lib/content/store";
import { loadSettings } from "@/lib/content/settings";
import {
  parallaxStyle,
  stageParallax,
  stagePhoto,
  stagePhotoStyle,
} from "@/lib/motion";

/**
 * Per-photo resting tilt and parallax depth. Varying the depth is what
 * makes the grid feel like layered prints rather than a flat row — the
 * photos separate as you scroll and re-settle as you pass.
 */
const PHOTO_ROTATION = [-5, 3, -2, 4];
const PARALLAX_DEPTH = [90, 40, 110, 55];
const PHOTO_NUDGE = ["sm:mt-0", "sm:mt-14", "sm:mt-4", "sm:mt-20"];

/**
 * Memory Lane (PHASE5 §5) — the most expressive motion moment on the page.
 * <ScrollStage> links choreography to scroll position so photos assemble on
 * the way in and disperse on the way out, with per-photo parallax depth.
 *
 * Abstract decorative circles removed per PHASE5 §8 — the photo
 * choreography and type scale carry the section now.
 */
export async function MemoryLane() {
  const t = await getTranslations("home.memoryLane");
  const locale = (await getLocale()) as "fr" | "en";
  const [photos, settings] = await Promise.all([
    getPastEditions(),
    loadSettings(),
  ]);
  const galleryUrl = settings.memoryLane.galleryUrl.trim();
  const currentGalleryUrl = settings.memoryLane.currentGalleryUrl.trim();
  // The whole point of a "current edition" album is that there IS one now —
  // showing its slot before the event has even happened would either link
  // nowhere or promise a "coming soon" for something a year away.
  const ended = eventHasEnded(new Date(), [settings.eventDate]);

  return (
    <SectionContainer background="offwhite" maxWidth="6xl">
      <ScrollStage>
        <div className={stageParallax} style={parallaxStyle(26)}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-sans text-display-xl font-bold text-black02">
                {t("title")}
              </h2>
              <p className="mt-6 max-w-xl text-body-l text-black02/80">
                {t("body")}
              </p>
            </div>
            {/* The recap has no URL yet, and a link to "#" is a link to
                nowhere — for a visitor and for a crawler alike. It appears
                the moment RECAP_URL is real. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {!isPlaceholderUrl(RECAP_URL) && (
                <a
                  href={RECAP_URL}
                  className="whitespace-nowrap font-sans text-body-m font-bold text-black02 underline decoration-2 underline-offset-4 transition-colors duration-200 hover:text-black02/60"
                >
                  {t("recapCta")}
                </a>
              )}
              {/*
                Last edition's album, admin-editable (ADR 0056/0058). Leaves
                the site, so it opens a new tab — and says so to a screen
                reader, which cannot see the arrow. `noopener noreferrer`:
                the album is a third-party page and gets neither a handle on
                this window nor our URL as its referrer.

                OUTLINE, not filled — once the event has passed, this sits
                next to THIS edition's album below, which takes the filled
                "primary" treatment as the one somebody actually came for.
                Before that, it is the only gallery button on the page, and
                an outline button standing alone reads exactly as
                intentional as a filled one would.
              */}
              {galleryUrl && !isPlaceholderUrl(galleryUrl) && (
                <a
                  href={galleryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 whitespace-nowrap rounded-pill border-2 border-black02 bg-transparent px-5 py-2.5 font-sans text-body-m font-bold text-black02 transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {t("galleryCta", { year: PAST_GALLERY_YEAR })}
                  <ArrowUpRight
                    size={18}
                    weight="bold"
                    aria-hidden
                    className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                  />
                  <span className="sr-only">{t("galleryNewTab")}</span>
                </a>
              )}

              {/*
                THIS edition's album — only once there is an edition to show
                one for. Filled/primary: past the event, this is the thing
                somebody actually wants, ahead of the (now secondary) link to
                an older year above. With no URL set yet it degrades to a
                plain, non-interactive "coming soon" notice rather than a
                dead link — there is nothing to point it at.
              */}
              {ended &&
                (currentGalleryUrl && !isPlaceholderUrl(currentGalleryUrl) ? (
                  <a
                    href={currentGalleryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 whitespace-nowrap rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    {t("galleryCta", { year: EVENT.year })}
                    <ArrowUpRight
                      size={18}
                      weight="bold"
                      aria-hidden
                      className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                    />
                    <span className="sr-only">{t("galleryNewTab")}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-pill border-2 border-black02/30 px-5 py-2.5 font-sans text-body-m font-bold text-black02/65">
                    {t("galleryComingSoon")}
                  </span>
                ))}
            </div>
          </div>
        </div>

        {photos.length === 0 ? (
          /*
            EMPTY STATE (PHASE22 §A7, redrawn per follow-up feedback) — a row
            of dashed OUTLINE frames, the same idiom as the sponsor strip's
            `EmptySeat`: an open slot is a shape with nothing in it yet, not
            a fabricated photo and not a single message box standing alone.
            Sized and cropped like the real polaroid grid below (same 4:5
            frame, same alternating tilt) so the empty state reads as "these
            slots," not as a different component. `getPastEditions` can
            genuinely return nothing now that this collection has a real
            admin screen — an organiser cleared the old placeholder seed.
          */
          <div className="mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {PHOTO_ROTATION.map((rotate, i) => (
              <div
                key={i}
                className={PHOTO_NUDGE[i % PHOTO_NUDGE.length]}
                style={{ transform: `rotate(${rotate}deg)` }}
              >
                <div
                  aria-hidden
                  className="flex aspect-[4/5] items-center justify-center rounded-lg border-2 border-dashed border-black02/25"
                />
              </div>
            ))}
            <p className="sr-only col-span-full">{t("photosComingSoon")}</p>
          </div>
        ) : (
          <MemoryPhotoGrid photos={photos} locale={locale} />
        )}
      </ScrollStage>
    </SectionContainer>
  );
}

/**
 * The prints (PHASE22 §A7, hover behaviour PHASE23 feedback).
 *
 * THE ALT TEXT IS ALSO THE POPOVER. Each print is a `data-cursor-card` zone —
 * the same mechanism as the sponsor popups (`CustomCursor`) — so pointing at
 * one on a desktop shows a small card carrying its description (and the year,
 * when the photo has one) beside the pointer. That card lives in the cursor's
 * `aria-hidden` layer; the photo's `alt` is what a screen reader hears, so
 * nothing is announced twice and nothing is hover-only for assistive tech.
 *
 * Hover also acts on the print itself: it lifts and straightens a little, and
 * its neighbours step back (`.memory-grid` / `.memory-polaroid` in
 * motion.css). Touch and reduced-motion get neither — and, in their place,
 * the description written on the print's deep lower border, exactly where you
 * would caption a real one (`.memory-inline-caption`, hidden under the same
 * media query the cursor runs under, so one of the two is always there).
 */
export function MemoryPhotoGrid({
  photos,
  locale,
}: {
  photos: PastEditionPhoto[];
  locale: "fr" | "en";
}) {
  return (
    <div className="memory-grid mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4">
      {photos.map((photo, i) => {
        const alt = photo.alt[locale]?.trim();
        return (
          <div
            key={photo.id}
            className={`memory-photo ${stageParallax} ${PHOTO_NUDGE[i % PHOTO_NUDGE.length]}`}
            style={parallaxStyle(PARALLAX_DEPTH[i % PARALLAX_DEPTH.length])}
          >
            {/* Parallax lives on the wrapper, stage choreography on the
                inner element — two elements so the two transforms don't
                overwrite each other. */}
            <div
              className={stagePhoto}
              style={stagePhotoStyle(
                i,
                PHOTO_ROTATION[i % PHOTO_ROTATION.length],
              )}
            >
              {/*
                The polaroid treatment already built for the speaker/team
                slider (`PersonSlider.tsx`), reused rather than rebuilt —
                same thick white border, black outline and offset shadow.
                `.memory-polaroid` only changes its SIZING (width-driven
                for a grid cell, instead of the slider's height-driven
                box) — see the note on that class in motion.css.

                A photo with no description simply has no popover: an empty
                card would be a rectangle with nothing in it.
              */}
              <div
                className="polaroid memory-polaroid"
                style={{ ["--memory-lift" as string]: i % 2 === 0 ? -2 : 2 }}
                {...(alt
                  ? {
                      "data-cursor-card": alt,
                      "data-cursor-tilt": i % 2 === 0 ? -3 : 3,
                      ...(photo.year
                        ? { "data-cursor-card-body": String(photo.year) }
                        : {}),
                    }
                  : {})}
              >
                <MorphedImageFrame
                  src={photo.imageUrl}
                  alt={alt ?? ""}
                  aspectRatio="4/5"
                  className="rounded-none border-0"
                />
                {alt && (
                  <p
                    aria-hidden
                    className="memory-inline-caption line-clamp-2 font-mono text-caption leading-tight text-black02/75"
                  >
                    {alt}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
