"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { calmBreathe, calmFade } from "@/lib/motion";
import {
  TESTIMONIAL_ROLES,
  type PublicTestimonial,
} from "@/lib/testimonials/rules";
import { SITE_HOST } from "@/lib/site-config";

/** How long the fade out (and then in) takes — matches `.calm-fade`. */
const FADE_MS = 1400;
/** A short story stays ~8 s, a long one up to ~16 s: time to actually read it. */
const holdFor = (text: string) => Math.min(16_000, 6_500 + text.length * 35);
/** New approvals join the reel without anyone reloading the display. */
const REFRESH_MS = 60_000;

/**
 * The wall's "Stories" mode (ADR 0087): approved anonymous testimonials, one
 * at a time, fading in and out — oldest edition first, so the reel narrates
 * the years in order and then begins again.
 *
 * Behind each one, very faint, the year it is about. Nothing else moves.
 */
export function WallStories({ initial }: { initial: PublicTestimonial[] }) {
  const t = useTranslations("pages.wall.stories");
  const tr = useTranslations("testimonial.roles");
  const [stories, setStories] = useState(initial);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(true);

  // Refresh the reel from time to time.
  useEffect(() => {
    const id = window.setInterval(() => {
      fetch("/api/testimonials", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { testimonials?: PublicTestimonial[] } | null) => {
          if (body?.testimonials) setStories(body.testimonials);
        })
        .catch(() => {});
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const count = stories.length;
  const story = count ? stories[index % count] : null;

  // Hold, fade out, move on, fade in.
  useEffect(() => {
    if (!story || count < 2) return;
    const out = window.setTimeout(
      () => setShown(false),
      holdFor(story.message),
    );
    const next = window.setTimeout(
      () => {
        setIndex((i) => (i + 1) % count);
        setShown(true);
      },
      holdFor(story.message) + FADE_MS,
    );
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(next);
    };
  }, [story, count]);

  const roleLabel = (role: string | null) =>
    role && (TESTIMONIAL_ROLES as readonly string[]).includes(role)
      ? tr(role)
      : role;

  const year = story?.edition?.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
  const attribution = story
    ? [
        roleLabel(story.role),
        story.edition && !/^\d{4}$/.test(story.edition)
          ? story.edition
          : year
            ? `DevFest ${year}`
            : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-pastel px-6 pb-28 pt-10 sm:px-16">
      <span
        aria-hidden
        className={`${calmBreathe} pointer-events-none absolute left-1/2 top-1/2 h-[75vmax] w-[75vmax] rounded-full bg-halftone/25`}
      />

      {story ? (
        <>
          {/* The year, enormous and faint: where in the story we are. */}
          <span
            aria-hidden
            data-shown={shown}
            className={`${calmFade} pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none text-center font-sans text-[clamp(10rem,32vw,28rem)] font-bold leading-none text-black02/[0.05]`}
          >
            {year ?? ""}
          </span>

          <figure
            data-shown={shown}
            aria-live="polite"
            className={`${calmFade} relative max-w-5xl text-center`}
          >
            <blockquote
              lang={story.locale}
              className="whitespace-pre-line font-sans text-[clamp(1.75rem,4vw,3.75rem)] font-bold leading-[1.2] text-black02"
            >
              &ldquo;{story.message}&rdquo;
            </blockquote>
            <figcaption className="mt-8 font-mono text-body-m text-black02/65">
              {attribution || t("anonymous")}
            </figcaption>
          </figure>
        </>
      ) : (
        <div className="relative max-w-xl text-center">
          <p className="font-sans text-heading-l font-bold text-black02">
            {t("emptyTitle")}
          </p>
          <p className="mt-3 text-body-l text-black02/70">{t("emptyBody")}</p>
        </div>
      )}

      {/* How to add yours — at the top, clear of the wall's bottom bar. */}
      <p className="absolute inset-x-6 top-6 text-center font-mono text-caption text-black02/60 sm:top-8">
        {t("addYours", { url: `${SITE_HOST}/testimonial` })}
      </p>
    </div>
  );
}
