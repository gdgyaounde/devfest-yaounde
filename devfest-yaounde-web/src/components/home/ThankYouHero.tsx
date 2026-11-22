import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { ContentImage } from "@/components/ui/ContentImage";
import { EVENT, formatEventDates } from "@/lib/event";
import { isPlaceholderUrl } from "@/lib/site-config";
import { calmDelay, calmIn, storyWord, wordDelay } from "@/lib/motion";

/**
 * The landing hero for the days after the edition (ADR 0098): a thank-you.
 *
 * ## The composition
 *
 * The group photograph fills the section, settling in slowly. Over it, an
 * eyebrow, a two-word thank-you set as flat yellow stamps (legible over any
 * photograph, and over none), a short note in an off-white card, and the one
 * useful link: the album. The watermark band sits along the bottom edge.
 *
 * ## No navbar here
 *
 * `GlobalChrome` keeps the navbar and the banner out of sight on the home
 * page until the visitor scrolls past this section, then slides them in and
 * they stay for the rest of the site. So this hero has no chrome clearance
 * to leave: the content is simply centred in the viewport.
 *
 * ## The photograph
 *
 * `backdropUrl` is the dashboard's hero image (Admin → Config → hero), so the
 * group photo can arrive without a deploy. Until one is uploaded the section
 * is the theme's pastel ground and reads as a finished state, not a gap.
 *
 * ## The watermark
 *
 * `/brand/watermark-devfest.svg` — replace the file to change it. It is
 * decorative (`alt=""`): the same words are in the heading above it.
 */
export async function ThankYouHero({
  locale,
  backdropUrl,
  currentGalleryUrl,
  eventDate,
}: {
  locale: string;
  backdropUrl: string;
  currentGalleryUrl: string;
  eventDate: string;
}) {
  const t = await getTranslations("home.thanks");
  const th = await getTranslations("home.hero");
  const lang = locale === "en" ? "en" : "fr";
  const date = formatEventDates(lang, [eventDate]) ?? "";
  const gallery = currentGalleryUrl.trim();
  const hasGallery = Boolean(gallery) && !isPlaceholderUrl(gallery);
  const hasPhoto = Boolean(backdropUrl?.trim());

  return (
    <section
      id="thank-you"
      className="relative isolate flex min-h-svh flex-col overflow-hidden bg-pastel"
    >
      {/* The ground, the photograph, and a flat scrim so the text card and
          the stamps stay readable whatever the photo's brightness. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-pastel">
        {hasPhoto && (
          <>
            <div className="ty-photo ty-pause absolute inset-0">
              <ContentImage
                src={backdropUrl}
                alt=""
                sizes="100vw"
                priority
                className="object-cover"
              />
            </div>
            <div className="absolute inset-0 bg-black02/30" />
          </>
        )}
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-[calc(14.2vw+1.5rem)] pt-12 sm:px-8">
        <p
          className={`${calmIn} ty-pause w-fit rounded-pill border-2 border-black02 bg-offwhite px-4 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02`}
          style={calmDelay(300)}
        >
          {t("eyebrow", { year: EVENT.year, date })}
        </p>

        <h1 className="mt-5 flex flex-col items-start gap-2 font-sans text-[clamp(3.25rem,min(12vw,13svh),9.5rem)] font-bold leading-[0.95] tracking-[-0.03em] text-black02">
          <span className="inline-block -rotate-2 rounded-lg border-[0.04em] border-black02 bg-primary px-[0.22em] py-[0.02em] shadow-[0_0.05em_0_0_var(--color-black02)]">
            <span className={`${storyWord} ty-pause`} style={wordDelay(500)}>
              {t("lead")}
            </span>
          </span>
          <span className="inline-block rotate-1 rounded-lg border-[0.04em] border-black02 bg-offwhite px-[0.22em] py-[0.02em] shadow-[0_0.05em_0_0_var(--color-black02)] sm:ml-[0.6em]">
            <span className={`${storyWord} ty-pause`} style={wordDelay(1000)}>
              {t("city")}
            </span>
          </span>
        </h1>

        <p
          className={`${calmIn} ty-pause mt-6 max-w-2xl rounded-lg border-2 border-black02 bg-offwhite p-5 text-body-l text-black02 shadow-[0_4px_0_0_var(--color-black02)] sm:p-6`}
          style={calmDelay(1700)}
        >
          {t("body", { year: EVENT.year, date })}
        </p>

        <div
          className={`${calmIn} ty-pause mt-6 flex flex-wrap items-center gap-3`}
          style={calmDelay(2200)}
        >
          {hasGallery ? (
            <Button tone="primary" href={gallery} external size="lg">
              {th("ctaGallery", { year: EVENT.year })}
              <span className="sr-only">{th("ctaGalleryNewTab")}</span>
            </Button>
          ) : (
            /* A quiet pill, not a faded button: a disabled button reads as
               broken over a photograph. */
            <span className="inline-flex items-center rounded-pill border-2 border-black02 bg-offwhite px-6 py-3 font-sans text-body-l font-bold text-black02">
              {th("ctaGalleryComingSoon")}
            </span>
          )}
          <Button tone="black02" href="/schedule" size="lg">
            {t("ctaSchedule")}
          </Button>
        </div>
      </div>

      {/* The watermark along the bottom edge. Decorative; plain <img> because
          an SVG gains nothing from the optimiser. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/watermark-devfest.svg"
        alt=""
        aria-hidden
        draggable={false}
        className="ty-watermark ty-pause pointer-events-none absolute inset-x-0 bottom-0 z-20 w-full select-none"
      />
    </section>
  );
}
