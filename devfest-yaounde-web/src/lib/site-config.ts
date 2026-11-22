/**
 * The canonical origin. Everything that has to name the site — canonical
 * tags, hreflang alternates, OG/Twitter URLs, the sitemap, robots.txt and the
 * DP generator's share caption — reads it from here, so the domain is one
 * edit rather than a hunt through metadata blocks.
 *
 * The env var still wins, because a preview deployment should describe
 * itself; the constant is the fallback and the production answer.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://devfest.gdgyaounde.com";

/** The same origin without its scheme — for copy that shows a URL to a human. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "").replace(
  /\/$/,
  "",
);

/**
 * Is this URL a stand-in rather than a real destination?
 *
 * Placeholders are written as `"#"` while the real address is unknown. An
 * anchor pointing at one is worse than no anchor: it does nothing when
 * clicked, and a crawler counts it as a link that goes nowhere — the single
 * biggest SEO defect on the site before this, at 164 dead anchors across 18
 * pages, almost all of them speaker and team profiles.
 *
 * So the rule is: **never render a link to a placeholder.** Either leave the
 * item out (an icon nobody can use) or render the label as plain text (a
 * legal page people expect to see named).
 */
export function isPlaceholderUrl(url: string | null | undefined): boolean {
  return (
    !url || url === "#" || url.trim() === "" || url.startsWith("javascript:")
  );
}

/**
 * Placeholder external links for global chrome. None of these have been
 * supplied yet — replace with the real URLs before launch. Centralized here
 * so they're a one-line edit instead of a hunt through JSX.
 * See docs/guides/updating-global-chrome.md.
 */
/**
 * The chapter's event page. The free (HAIKYU) pass is an RSVP there rather
 * than a purchase here — the platform already enforces one free RSVP per
 * person, which is the reason that tier is not sold on this site.
 */
/** Chapter inbox — wall takedowns go here, not a button on the card. */
export const CHAPTER_EMAIL = "gdgyaounde@gmail.com";

export const BEVY_URL =
  "https://gdg.community.dev/events/details/google-gdg-yaounde-presents-devfest-yaounde-2026/cohost-gdg-yaounde/";

export const SOCIAL_LINKS = {
  x: "#",
  instagram: "#",
  whatsapp: "#",
  linkedin: "#",
  youtube: "#",
  facebook: "#",
}; // TODO: real DevFest Yaoundé social profile URLs

/** Last edition's recap post or album. Not published yet. */
export const RECAP_URL = "#";

/**
 * The legal links. Participation terms are on-site since ADR 0074 (/terms);
 * privacy and terms of service are still Google's.
 *
 * These are the repo fallback. `site_settings.legal` overrides them once an
 * organiser edits them in the dashboard (ADR 0038), same rule as every other
 * setting: the database wins, the repo keeps a fresh clone working.
 *
 * They are Google's and GDG's pages rather than ours, which is correct — the
 * chapter runs under those terms and does not publish its own.
 */
export const PARTICIPATION_TERMS_URL = "/terms";

/**
 * GDG's own participation terms and code of conduct — still external, and
 * still the conduct document the chapter runs under (ADR 0040). Linked from
 * the on-site /terms page (ADR 0074), which covers what the GDG page cannot:
 * what each DevFest pass includes.
 */
export const GDG_CODE_OF_CONDUCT_URL =
  "https://gdg.community.dev/participation-terms/";

/**
 * The participation terms' version (ADR 0074). Bumping it — here, or in
 * Admin → Config → Legal — shows every visitor the "terms updated" pop-up
 * once more. `TERMS_UPDATED_AT` is the date printed at the top of /terms.
 */
export const TERMS_VERSION = "2026-11-15";
export const TERMS_UPDATED_AT = "2026-11-15";
export const PRIVACY_POLICY_URL = "https://policies.google.com/privacy";
export const TERMS_URL = "https://policies.google.com/terms";

/*
 * THERE IS NO SEPARATE CODE OF CONDUCT, and that is a decision rather than a
 * gap (ADR 0040). The chapter runs under GDG's participation terms — that is
 * what its Bevy page links — so the site names and links the same document
 * instead of promising a second one it does not have.
 */

/** The call for speakers. Overridden by `site_settings.cfs`. */
export const CFS_URL = "https://sessionize.com/devfest-yaounde-2026";
export const CFS_OPENS_AT = "2026-09-05T01:00:00+01:00";
export const CFS_CLOSES_AT = "2026-10-31T23:59:00+01:00";

/**
 * The ticketing cutoff (ADR 0072). Overridden by `site_settings.ticketing`.
 *
 * Wednesday 18 November 2026 in Yaoundé (UTC+1, no DST): payments close at
 * 12:00 (moved up from 23:59 by ADR 0084), edits at 23:59. After
 * `TICKET_SALES_CLOSE_AT` checkout refuses tickets, ticket-only products AND
 * the shop;
 * after `TICKET_EDITS_CLOSE_AT` holders can no longer change their ticket's
 * details. Two instants rather than one so they CAN diverge, but today they
 * are the same minute. The offset is always written out: an offset-less
 * string would be read in the server's timezone, not Yaoundé's.
 */
export const TICKET_SALES_CLOSE_AT = "2026-11-18T12:00:00+01:00";
export const TICKET_EDITS_CLOSE_AT = "2026-11-18T23:59:00+01:00";

/**
 * The end of RESERVATIONS (ADR 0084). Payments stop at `TICKET_SALES_CLOSE_AT`
 * — for tickets AND the shop — and from then on people reserve instead of
 * paying on the platform. Friday 20 November 2026, 17:00 in Yaoundé; after
 * that, anyone pays in cash at the venue. Overridden by
 * `site_settings.ticketing.reservationsCloseAt`.
 */
export const RESERVATIONS_CLOSE_AT = "2026-11-20T17:00:00+01:00";

/**
 * Last edition's full photo gallery, linked from Memory Lane. Overridden by
 * `site_settings.memory_lane` so next year's album is a dashboard edit, not a
 * deploy.
 */
export const PAST_GALLERY_URL = "https://photos.app.goo.gl/S4nVSxBmu73FjChW6";

/**
 * This edition's album (DevFest Yaoundé 2026), linked from the thank-you
 * banner and Memory Lane (ADR 0098). Overridden by
 * `site_settings.memory_lane.currentGalleryUrl`.
 */
export const CURRENT_GALLERY_URL = "https://photos.app.goo.gl/aiU2LaXqxqFFQmgf6";

/** The sponsor prospectus. Overridden by `site_settings.sponsor_call`. */
export const SPONSOR_PROSPECTUS_URL =
  "https://drive.google.com/file/d/1Bof8zhqp5aOtweXL_qmXXGAvyGb1VAAQ/view?usp=sharing";
