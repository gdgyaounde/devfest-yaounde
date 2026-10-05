import { getTranslations } from "next-intl/server";
import { DevFestLogo } from "@/components/brand/DevFestLogo";
import { Button } from "@/components/ui/Button";
import { HeroBackdrop } from "@/components/home/HeroBackdrop";
import { HeroField } from "@/components/home/HeroField";
import { HeroStickers } from "@/components/home/HeroStickers";
import { HeroWordmark } from "@/components/home/HeroWordmark";
import { EVENT, eventDateParts, eventHasEnded } from "@/lib/event";
import { isPlaceholderUrl } from "@/lib/site-config";

/**
 * The landing hero (ADR 0046).
 *
 * ## The composition
 *
 * A photograph under everything, a dot-field texture over it, and the content
 * arranged in two columns above both. The left column is the mass: a small
 * label, then a two-line wordmark hugging the bottom-left that grows in like
 * a bar chart. The right column is the argument: tagline, the two CTAs, and
 * the date and venue set as figures — the slot the reference this comes from
 * gives its statistics. A cluster of the DP generator's own stickers is
 * spread across the middle, some in front of the wordmark and some behind it.
 *
 * ## What is reactive and what is fixed
 *
 * Deliberately split. The **wordmark does not move** — no pointer lean, no
 * scroll recede; it reveals once and then holds still. The **date and venue
 * do not move** either; they are figures, and figures that drift read as
 * unreliable. Everything that IS reactive is scenery: the stickers lean and
 * lift, the dot field's highlight follows the pointer, the photograph pulls
 * back as the section leaves. The fixed things are the ones carrying
 * information.
 *
 * ## Chrome clearance
 *
 * The navbar and the announcement banner float over the top of the page, and
 * the banner can be dismissed — so the space they occupy is not constant.
 * The content column starts below `--chrome-h`, which is the token sized for
 * the taller case (banner up). Dismissing it only ever gives the hero more
 * room, never less, so the label and the top of the cluster cannot end up
 * behind the chrome.
 */

export async function Hero({
  locale,
  backdropUrl,
  currentGalleryUrl,
  eventDate,
}: {
  locale: string;
  /**
   * The hero's backdrop, from `site_settings.hero` — chosen in the dashboard.
   *
   * It used to be `pastEditions[0]`, which meant reordering the Memory Lane
   * gallery silently changed the front page's background. Two unrelated
   * screens should not be coupled by an array index (ADR 0047).
   */
  backdropUrl: string;
  /**
   * THIS edition's photo album, from `site_settings.memory_lane` — empty
   * until an organiser adds it. See the CTA swap below (ADR 0058).
   */
  currentGalleryUrl: string;
  eventDate: string;
}) {
  const t = await getTranslations("home.hero");
  const lang = locale === "en" ? "en" : "fr";
  const when = eventDateParts(lang, [eventDate]);
  /*
    Once the event is over, "Grab your ticket" is not a live offer any more
    — there is nothing left to buy a ticket TO. The one thing a returning
    visitor actually wants at that point is the album, so the SAME primary
    slot becomes that instead of adding a competing third button to an
    already-tight cluster.
  */
  const ended = eventHasEnded(new Date(), [eventDate]);
  const gallery = currentGalleryUrl.trim();
  const hasGallery = Boolean(gallery) && !isPlaceholderUrl(gallery);

  return (
    <section className="relative isolate flex min-h-svh flex-col overflow-hidden bg-pastel">
      <HeroBackdrop src={backdropUrl} alt={t("photoAlt")} />

      <HeroField className="relative flex flex-1 flex-col px-5 sm:px-8">
        {/*
          The sticker cluster — both layers, one scatter. It positions its
          own wrappers, because the two layers have to be drawn from the
          same draw and a component cannot share state with a sibling.
        */}
        <HeroStickers locale={lang} />

        {/* ---------- The right column: the argument ---------- */}

        {/*
          `mt-[--chrome-h]` is the clearance the floating navbar and banner
          need. It is the banner-up height, so dismissing the banner only
          adds room.
        */}
        {/*
          `max()` is the chrome-clearance guarantee from the brief. The column
          wants to sit around a quarter of the way down, matching the
          reference — but on a short window a quarter of the height is less
          than the navbar and banner occupy, and the tagline would slide
          underneath them. Whichever is larger wins, so dismissing the banner
          only ever gives the hero more room.
        */}
        <div className="hero-leave-trail relative z-20 mt-[max(var(--chrome-h),24vh)] sm:absolute sm:right-8 sm:top-[max(var(--chrome-h),24vh)] sm:mt-0 sm:w-[21rem] lg:w-[23rem]">
          <div>
            <p
              className="hero-settle text-body-l text-black02/85"
              style={{ ["--settle-delay" as string]: "260ms" }}
            >
              {t("tagline")}
            </p>

            <div
              className="hero-settle mt-7 flex flex-wrap items-center gap-3"
              style={{ ["--settle-delay" as string]: "340ms" }}
            >
              {!ended ? (
                <Button tone="primary" href="/tickets" size="lg">
                  {t("ctaPrimary")}
                </Button>
              ) : hasGallery ? (
                <Button tone="primary" href={gallery} external size="lg">
                  {t("ctaGallery", { year: EVENT.year })}
                  <span className="sr-only">{t("ctaGalleryNewTab")}</span>
                </Button>
              ) : (
                <Button tone="primary" size="lg" disabled>
                  {t("ctaGalleryComingSoon")}
                </Button>
              )}
              <Button tone="black02" variant="secondary" href="/shop" size="lg">
                {t("ctaSecondary")}
              </Button>
            </div>
          </div>
        </div>

        {/* ---------- The left column: the mass ---------- */}

        <div className="hero-leave relative z-20 mt-auto pb-[2vh]">
          {/*
            The label: our mark plus who is putting this on, in the slot the
            reference gives its own small-caps line. Quiet on purpose — it is
            a credit, and the thing under it is the loud one.
          */}
          <div
            className="hero-settle mb-5 flex items-center gap-3"
            style={{ ["--settle-delay" as string]: "180ms" }}
          >
            <DevFestLogo
              animateIn
              interactive
              title="DevFest"
              className="h-8 w-auto shrink-0 cursor-pointer sm:h-10"
            />
            <span className="font-mono text-body-m font-bold uppercase tracking-[0.16em] text-black02/70 sm:text-body-l">
              {EVENT.organizer}
            </span>
          </div>

          {/*
            Sized against measured boxes, not guessed. Two earlier attempts
            put the bottom of "Yaoundé" below the fold on a 1440×900 screen —
            the reference crops its own second line slightly, but half a
            missing line reads as a bug rather than as a crop.

            `2xl` steps it back down: `vw` sizing on a 2560px monitor produced
            a wordmark half the viewport tall, which is past confident and
            into unreadable.
          */}
          {/*
            The wordmark, and the year stamped on it.

            `relative` so the year can be positioned against the type rather
            than against the section — the pill has to stay on "Yaoundé" at
            every width, and the wordmark's box is the only thing that scales
            with the letters.
          */}
          <div className="relative text-[17vw] sm:text-[13.5vw] 2xl:text-[10.5vw]">
            <HeroWordmark srLabel={t("headline", { year: EVENT.year })} />

            {/*
              THE YEAR, as a sticker rather than as part of the wordmark.

              A pill, bordered and angled, sitting on the second line — which
              is the one place in the composition where a small hard-edged
              object reads as deliberately placed rather than as another
              floating element. It is NOT in the random scatter: this one
              carries information, and information does not move every load.

              `EVENT.year` rather than a literal, so next year's edition is
              already correct. Offsets are in `em` so the pill tracks the type
              it sits on instead of drifting off it at another breakpoint.
            */}
            <span
              aria-hidden
              className="hero-settle absolute bottom-[3%] left-[13%] inline-flex -rotate-[7deg] items-center rounded-pill border-[0.035em] border-black02 bg-primary px-[0.34em] py-[0.1em] font-mono text-[0.17em] font-bold tracking-[0.06em] text-black02 shadow-[0_0.06em_0_0_var(--color-black02)]"
              style={{ ["--settle-delay" as string]: "1100ms" }}
            >
              {EVENT.year}
            </span>
          </div>
        </div>

        {/*
          THE FIGURES, bottom-right and on one line.

          They were a vertical pair under the CTAs, which read as a list of
          two more things in a column that already had three. Set side by side
          along the bottom edge they read as a caption to the whole hero —
          which is what a date and a place are — and they balance the
          wordmark's mass on the opposite corner.

          Absolute from `sm` up for the same reason the right column is: the
          bottom-right corner is a position, not a place in a stack. On a
          phone they stay in the flow, where there is no corner to sit in.
        */}
        <dl
          className="hero-settle hero-leave-trail relative z-20 mt-10 flex flex-wrap items-end gap-x-10 gap-y-4 sm:absolute sm:bottom-[3vh] sm:right-8 sm:mt-0 sm:justify-end"
          style={{ ["--settle-delay" as string]: "440ms" }}
        >
          {when && (
            <div>
              <dt className="sr-only">{t("dateLabel")}</dt>
              <dd>
                <span className="block font-sans text-display-l font-bold leading-none text-black02">
                  {when.value}
                </span>
                <span className="mt-2 block font-mono text-mono-tag uppercase tracking-wide text-black02/65">
                  {when.caption}
                </span>
              </dd>
            </div>
          )}

          {/* A hairline between the two, so they read as one caption rather
              than two unrelated blocks that happen to be adjacent. */}
          <span
            aria-hidden
            className="hidden h-12 w-px self-center bg-black02/20 sm:block"
          />

          <div>
            <dt className="sr-only">{t("venueLabel")}</dt>
            <dd>
              <span className="block font-sans text-display-l font-bold leading-none text-black02">
                {EVENT.city}
              </span>
              <span className="mt-2 block font-mono text-mono-tag uppercase tracking-wide text-black02/65">
                {EVENT.venue ?? t("venueCaption")}
              </span>
            </dd>
          </div>
        </dl>
      </HeroField>
    </section>
  );
}
