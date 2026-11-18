"use client";

/*
 * eslint-disable @next/next/no-img-element
 *
 * A plain <img> here is the considered choice, not the unfinished one. Logo
 * URLs are the least controlled in the store — uploaded to our bucket in the
 * normal case, but a seed file or an import can carry any host — and
 * `next/image` throws a 500 on a host that is not in `remotePatterns`. An
 * unoptimised logo is a far better failure than a sponsor strip that takes
 * the home page down. Logos are also small and frequently SVG, where the
 * optimiser has nothing to win.
 */
/* eslint-disable @next/next/no-img-element */

import { Buildings, Egg } from "@phosphor-icons/react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Sponsor, SponsorTier } from "@/data/types";
import type { SponsorSeat } from "@/lib/content/sponsors";

/**
 * The interactive half of the sponsor strip — hover state (spotlight/dim,
 * the cursor popup) needs a client boundary, which `SponsorStrip.tsx` itself
 * cannot cross: it is `async` and reads translations server-side. Split the
 * same way `DpWall`/`WallTile` are: data and translation server-side, hover
 * behaviour in a client child (PHASE22 §A2/§A3).
 */

/**
 * Tier-badge colours (PHASE22 §A5, stickers replacing the letter/icon
 * placeholder per the follow-up round). Only the design system's fixed
 * literal accents are used (never `--color-primary`/`--color-contrast`,
 * which follow the swappable theme — a badge whose colour depended on the
 * active theme could collide with whichever OTHER tier happens to map to
 * that same live colour). Five paid tiers get five distinct trues; the two
 * non-monetary tiers share black02 and are told apart by their own mark
 * instead, because the palette only has four non-neutral accents to spend.
 */
const TIER_ACCENT: Record<SponsorTier, string> = {
  haikyu: "var(--color-offwhite)",
  sonnet: "var(--color-blue)",
  opus: "var(--color-green)",
  fable: "var(--color-red)",
  mythos: "var(--color-yellow)",
  community: "var(--color-black02)",
  partner: "var(--color-black02)",
};

/**
 * One small mark per tier — drawn for this badge alone, in a 24×24 box,
 * single-colour so it reads at 13px. Each is its OWN function rather than a
 * shared `paths` table like `dp/stickers.ts`'s sheet: that sheet feeds the DP
 * generator's picker and the hero/testimonial random scatters, and a tier's
 * identity mark must never turn up as a decorative pick somewhere else on
 * the site, nor let a sticker meant for decoration leak in here as a tier
 * mark. Two separate, unconnected catalogs, on purpose.
 *
 * The shapes nod at each tier's own name rather than being interchangeable
 * dots: a seed for the entry tier, a note for Sonnet, a star for Opus (as in
 * "magnum opus"), an open book for Fable, a flame for Mythos, a small
 * connected-node cluster for Community, and two linked rings for Partner.
 */
function HaikyuMark({ color }: { color: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill={color}
        d="M12 2c3.4 3.6 4.4 7 3 9.9-1.2 2.5-3.8 3.4-3.8 3.4S12 11.6 8.6 8.3C6 5.8 12 2 12 2Z"
      />
      <path fill={color} d="M7.5 13.5c0 3 2 5.5 4.5 5.5s4.5-2.5 4.5-5.5H7.5Z" />
    </svg>
  );
}

function SonnetMark({ color }: { color: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill={color}
        d="M9.5 15.2a2.8 2.8 0 1 0 2 2.68V8.4l6-1.2V4.1l-8 1.6v9.5Z"
      />
    </svg>
  );
}

function OpusMark({ color }: { color: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill={color}
        d="M12 2.5 14.6 9l7 .55-5.4 4.5 1.7 6.8L12 17.1l-6 3.75 1.7-6.8-5.4-4.5 7-.55L12 2.5Z"
      />
    </svg>
  );
}

function FableMark({ color }: { color: string }) {
  // A bookmark ribbon, not an open book — at 13px an open book's two pages
  // read as a pause icon (checked against a screenshot; the pages sat too
  // close to distinguish from two flat bars). A single tag-shaped silhouette
  // survives shrinking a lot better than two thin parallel shapes do.
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill={color}
        d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"
      />
    </svg>
  );
}

function MythosMark({ color }: { color: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill={color}
        d="M12.4 2c1 3.4-.6 4.6-1.9 6.4-1.3 1.9-.3 3.1.9 3.1s2-1.2.9-3c1.9 1.6 3.7 4.4 3.7 7.2a5 5 0 1 1-10 0c0-4.3 3.6-8.6 6.4-13.7Z"
      />
    </svg>
  );
}

function CommunityMark({ color }: { color: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <g stroke={color} strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 6.5 6 16.5M12 6.5l6 10" />
      </g>
      <circle cx="12" cy="5" r="2.4" fill={color} />
      <circle cx="5" cy="18" r="2.4" fill={color} />
      <circle cx="19" cy="18" r="2.4" fill={color} />
    </svg>
  );
}

function PartnerMark({ color }: { color: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <circle
        cx="9.5"
        cy="12"
        r="5"
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
      <circle
        cx="15.5"
        cy="12"
        r="5"
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
    </svg>
  );
}

/** Dispatch to the tier's own mark — light ink on the light Haikyu badge, offwhite ink on the dark Community/Partner ones, dark ink everywhere else. */
function TierBadgeContent({ tier }: { tier: SponsorTier }) {
  const ink =
    tier === "community" || tier === "partner"
      ? "var(--color-offwhite)"
      : "var(--color-black02)";
  switch (tier) {
    case "haikyu":
      return <HaikyuMark color={ink} />;
    case "sonnet":
      return <SonnetMark color={ink} />;
    case "opus":
      return <OpusMark color={ink} />;
    case "fable":
      return <FableMark color={ink} />;
    case "mythos":
      return <MythosMark color={ink} />;
    case "community":
      return <CommunityMark color={ink} />;
    case "partner":
      return <PartnerMark color={ink} />;
  }
}

/**
 * Which corner a sponsor's badge sits in, and its small rotation — seeded by
 * the sponsor's OWN id, not `Math.random()`.
 *
 * This renders on the server (this file is a client COMPONENT, but Next
 * still does one SSR pass for the static prerender before hydrating), and a
 * value that differs between that server pass and the client's first render
 * is a hydration mismatch. Seeding by id gives an assignment that is
 * identical both times and still varies from one sponsor to the next — the
 * same reasoning `dp/wall-layout.ts`'s `seeded()` documents for the wall,
 * reapplied here rather than imported, since a card corner has different
 * inputs (one id, not a column index) and does not need a repeatable
 * SEQUENCE of draws, only one stable pick.
 */
const CORNERS = [
  { class: "-top-2 -left-2", rotateBase: -8 },
  { class: "-top-2 -right-2", rotateBase: 8 },
  { class: "-bottom-2 -left-2", rotateBase: -8 },
  { class: "-bottom-2 -right-2", rotateBase: 8 },
] as const;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

function badgePlacement(id: string): { className: string; rotate: number } {
  const h = hashId(id);
  const corner = CORNERS[h % CORNERS.length];
  // A few degrees either side of the corner's own lean — enough to read as
  // placed by hand, not enough to point the badge away from the card.
  const jitter = ((h >> 8) % 7) - 3;
  return { className: corner.class, rotate: corner.rotateBase + jitter };
}

export function SponsorRow({
  seats,
  scrolls,
}: {
  seats: SponsorSeat[];
  scrolls: boolean;
}) {
  const locale = useLocale() as "fr" | "en";
  /**
   * Keyed by the rendered slot, not the sponsor id — the marquee shows every
   * sponsor TWICE (the seamless-loop duplicate), and keying by id would
   * spotlight both copies of the same logo at once. Same fix the Community
   * Wall already made for the identical bug ("hovering one tile spotlit
   * every copy of that card").
   */
  const [hovered, setHovered] = useState<string | null>(null);
  const dimmed = hovered !== null;

  const rendered = scrolls ? [...seats, ...seats] : seats;

  return (
    <>
      {rendered.map((seat, i) => {
        const slotKey =
          seat.kind === "filled"
            ? `${seat.sponsor.id}-${i}`
            : `empty-${seat.index}-${i}`;
        const duplicate = scrolls && i >= seats.length;
        return seat.kind === "filled" ? (
          <SponsorCard
            key={slotKey}
            slotKey={slotKey}
            sponsor={seat.sponsor}
            locale={locale}
            duplicate={duplicate}
            scrolls={scrolls}
            spotlit={hovered === slotKey}
            dimmed={dimmed && hovered !== slotKey}
            onHover={setHovered}
          />
        ) : (
          <EmptySeat
            key={slotKey}
            scrolls={scrolls}
            hideOnMobile={seat.index >= 3}
          />
        );
      })}
    </>
  );
}

/**
 * One sponsor: logo, tier badge, spotlight/dim, and the two ways to learn
 * their name and blurb — a cursor popup on desktop, plain text on touch or
 * under reduced motion (PHASE22 §A2).
 */
/** Known tiers only — falls back for anything else (see the note below). */
function knownTier(tier: string | undefined): SponsorTier {
  return tier !== undefined && tier in TIER_ACCENT
    ? (tier as SponsorTier)
    : "community";
}

function SponsorCard({
  slotKey,
  sponsor,
  locale,
  duplicate,
  scrolls,
  spotlit,
  dimmed,
  onHover,
}: {
  slotKey: string;
  sponsor: Sponsor;
  locale: "fr" | "en";
  duplicate: boolean;
  scrolls: boolean;
  spotlit: boolean;
  dimmed: boolean;
  onHover: (key: string | null) => void;
}) {
  const t = useTranslations("home.sponsors");
  /*
   * `knownTier`, not `sponsor.tier ?? "community"` — a record can hold a
   * RETIRED tier name at runtime even though the type no longer allows one
   * (the old platinum/gold/silver sponsors do, until the rename migration
   * runs against that database). Falling back only on `undefined` left an
   * unrecognised string past the lookup below, and `TIER_ACCENT[unknown]`
   * is quietly `undefined` — confirmed live: the badge rendered with
   * `background-color: rgba(0,0,0,0)`, fully transparent, on the one real
   * sponsor still tagged `platinum`. Falling back on ANY unrecognised value
   * means a badge is never invisible, migrated or not.
   */
  const tier = knownTier(sponsor.tier);
  const blurb = sponsor.blurb?.[locale]?.trim();
  const badge = badgePlacement(sponsor.id);

  const logo = (
    <img
      src={sponsor.logoUrl}
      alt={sponsor.name}
      className="h-14 w-auto object-contain sm:h-[4.5rem]"
    />
  );

  const box = scrolls ? "mx-9 shrink-0 sm:mx-12" : "shrink-0";

  const tierSticker = (
    <span
      aria-hidden
      className={`absolute z-10 flex h-6 w-6 items-center justify-center rounded-pill border-2 border-black02 shadow-[0_2px_0_0_var(--color-black02)] ${badge.className}`}
      style={{
        backgroundColor: TIER_ACCENT[tier],
        transform: `rotate(${badge.rotate}deg)`,
      }}
    >
      {sponsor.sticker === "incubator" ? (
        <Egg size={14} weight="bold" color="var(--color-offwhite)" />
      ) : sponsor.sticker === "venue" ? (
        <Buildings size={14} weight="bold" color="var(--color-offwhite)" />
      ) : (
        <TierBadgeContent tier={tier} />
      )}
    </span>
  );

  // The duplicated half of a marquee is the same content twice: announcing
  // it reads the sponsor list out twice, a second focusable link means
  // tabbing through the same companies again, and it must never itself be a
  // hover/cursor-popup zone — spotlighting the ORIGINAL from a hover on its
  // silent twin would be its own version of the wall's old bug.
  if (duplicate) {
    return (
      <span aria-hidden className={`relative ${box}`} tabIndex={-1}>
        {tierSticker}
        {logo}
      </span>
    );
  }

  const content = sponsor.websiteUrl ? (
    <a
      href={sponsor.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      /* Click still opens the sponsor's site regardless of the popup —
         the two are independent (PHASE22 §A2). */
      onPointerEnter={() => onHover(slotKey)}
      onPointerLeave={() => onHover(null)}
      /* The cursor popup zone. `CustomCursor` reads these three attributes
         on pointerover; empty blurbs are simply omitted rather than sent
         as an empty string, so the card shows just the name. */
      data-cursor-card={sponsor.name}
      {...(blurb ? { "data-cursor-card-body": blurb } : {})}
      data-cursor-tilt={badge.rotate > 0 ? 3 : -3}
      className={`relative rounded-md transition-transform duration-200 ease-bouncy hover:scale-105 motion-reduce:transform-none ${box}`}
    >
      {tierSticker}
      {logo}
      {/* Always in the a11y tree, unlike the popup (aria-hidden) and the
          inline fallback below (display:none whenever a fine pointer with
          hover is present) — a mouse-plus-screen-reader visitor, who
          matches that same media query but never fires a real :hover,
          would otherwise never hear the blurb at all. The logo's own alt
          already carries the name (PHASE22 §G a11y audit). */}
      {blurb && <span className="sr-only sponsor-sr-blurb">{blurb}</span>}
    </a>
  ) : (
    <span
      onPointerEnter={() => onHover(slotKey)}
      onPointerLeave={() => onHover(null)}
      data-cursor-card={sponsor.name}
      {...(blurb ? { "data-cursor-card-body": blurb } : {})}
      data-cursor-tilt={badge.rotate > 0 ? 3 : -3}
      className={`relative ${box}`}
    >
      {tierSticker}
      {logo}
      {blurb && <span className="sr-only sponsor-sr-blurb">{blurb}</span>}
    </span>
  );

  return (
    <div
      className={`wall-tile ${spotlit ? "is-spotlit" : ""} ${dimmed ? "is-dimmed" : ""}`}
    >
      {content}
      {/*
        Touch and reduced-motion fallback — hidden by CSS under exactly the
        media query `CustomCursor` runs under (`.sponsor-inline-card` in
        globals.css), so one of the two is always present and never both.
        Centred under the logo; kept short, since a marquee row has no
        vertical room to spare.
      */}
      <p className="sponsor-inline-card mt-1 max-w-32 truncate text-center font-mono text-caption font-bold text-black02/70">
        {sponsor.name}
        {blurb && (
          <span className="block truncate font-normal text-black02/65">
            {blurb}
          </span>
        )}
      </p>
      <span className="sr-only">{t("newTab")}</span>
    </div>
  );
}

/**
 * A seat still going: a dashed outline the size of a logo.
 *
 * Sized to a LOGO rather than to its caption, so an uncaptioned seat is
 * plainly the same kind of thing as the labelled one beside it — a slot —
 * instead of a smaller box of unclear purpose.
 */
function EmptySeat({
  scrolls,
  hideOnMobile,
}: {
  scrolls: boolean;
  hideOnMobile: boolean;
}) {
  return (
    <span
      // Decorative in every case: the sr-only count states how many seats
      // are open, which is the fact. A screen reader working through six
      // unlabelled boxes learns nothing.
      aria-hidden
      className={[
        hideOnMobile ? "hidden sm:flex" : "flex",
        scrolls ? "mx-9 sm:mx-12" : "",
        "h-11 min-w-24 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-black02/25 px-4 sm:h-14 sm:min-w-32 sm:px-6",
      ].join(" ")}
    />
  );
}
