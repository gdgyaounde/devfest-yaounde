import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "./site-config";

export type Locale = "fr" | "en";

/** Absolute URL for a path within a locale. `path` starts with "/" or is "". */
export function localeUrl(locale: string, path = ""): string {
  return `${SITE_URL}/${locale}${path}`;
}

/**
 * The branded social image for a page.
 *
 * One route rendering many images rather than a static file per page: the
 * title changes, the design does not, and 12 hand-made PNGs would drift from
 * the brand the first time a colour moved.
 */
export function ogImageUrl(
  title: string,
  subtitle?: string,
  locale?: string,
): string {
  const params = new URLSearchParams({ title });
  if (subtitle) params.set("subtitle", subtitle);
  // The card's own eyebrow ("21 NOVEMBER 2026 · YAOUNDÉ") is
  // written in this language, so a French page unfurls in French.
  if (locale === "en") params.set("locale", "en");
  return `${SITE_URL}/og?${params.toString()}`;
}

/**
 * Everything a page needs to unfurl, from four inputs.
 *
 * Written once here because getting it right per page is the kind of job that
 * is done well on the first three pages and forgotten on the rest: canonical,
 * hreflang for BOTH locales plus x-default, OpenGraph, and a Twitter card,
 * all pointing at the canonical origin rather than at whatever host served
 * the request.
 *
 * `title` is the bare page title — the locale layout carries the `%s ·
 * DevFest Yaoundé` template, so it must NOT be repeated here.
 */
export function pageMetadata({
  locale,
  path = "",
  title,
  description,
  ogTitle,
  index = true,
}: {
  locale: string;
  path?: string;
  title: string;
  description: string;
  /** Overrides the OG image's headline when the page title is too terse. */
  ogTitle?: string;
  /**
   * `false` for pages that should never appear in results — a personal
   * account area, or a payment return URL that is meaningless without the
   * deposit id that came with it.
   */
  index?: boolean;
}): Metadata {
  const url = localeUrl(locale, path);
  const full = `${title} · DevFest Yaoundé`;
  const image = ogImageUrl(ogTitle ?? title, description, locale);

  const languages: Record<string, string> = {};
  for (const other of routing.locales)
    languages[other] = localeUrl(other, path);
  languages["x-default"] = localeUrl(routing.defaultLocale, path);

  return {
    title,
    description,
    alternates: { canonical: url, languages },
    ...(index ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      siteName: "DevFest Yaoundé",
      locale: locale === "en" ? "en_GB" : "fr_FR",
      /* Tells a crawler the other language exists as a sibling of THIS page,
         which is the OpenGraph half of the hreflang story. */
      alternateLocale: locale === "en" ? ["fr_FR"] : ["en_GB"],
      url,
      title: full,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: full }],
    },
    twitter: {
      card: "summary_large_image",
      title: full,
      description,
      images: [image],
    },
  };
}

/** Renders a JSON-LD block. `null` renders nothing, which is the point. */
export function JsonLd({ data }: { data: object | null }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      // The payload is built from in-repo constants, never from user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
