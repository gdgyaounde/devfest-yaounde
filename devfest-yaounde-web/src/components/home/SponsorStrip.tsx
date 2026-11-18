import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { getTranslations } from "next-intl/server";
import type { Sponsor } from "@/data/types";
import type { SponsorCallSettings } from "@/lib/admin/shape";
import {
  sponsorCallOpen,
  sponsorSeats,
  SPONSOR_SEATS,
} from "@/lib/content/sponsors";
import { marqueeLoop, marqueeTrack } from "@/lib/motion";
import { SponsorRow } from "./SponsorRow";

/**
 * The strip of logos across the bottom of the hero — and, right now, mostly
 * the strip of seats where logos are going to be.
 *
 * IT USED TO HIDE ITSELF when no sponsor had signed, which was the right fix
 * for the wrong problem: an empty marquee reads as broken. But a strip that
 * is absent tells a company reading the site nothing at all, and this is the
 * one surface where "there is room for you here" is worth saying out loud.
 *
 * So the seats are drawn either way. Three logos beside three open seats is a
 * more honest and more persuasive picture than three logos alone.
 *
 * WHY THE MARQUEE IS CONDITIONAL. It scrolls only once the seats are full.
 * While any seat is open there is nothing to scroll past — the row fits — and
 * animating a line of dashed placeholders would read as a loading skeleton,
 * which is the one thing it must not look like.
 *
 * INTERACTIVITY LIVES IN `SponsorRow` (PHASE22 §A2/§A3). This component stays
 * a server component — it only reads translations and shapes data — and
 * hands the computed seat list to a client child for the spotlight/dim hover
 * and the cursor popup, the same split `DpWall`/`WallTile` already use for
 * the identical reason.
 */
export async function SponsorStrip({
  sponsors,
  call,
  className = "",
  style,
}: {
  sponsors: Sponsor[];
  call: SponsorCallSettings;
  className?: string;
  style?: React.CSSProperties;
}) {
  const t = await getTranslations("home.sponsors");
  // Only the logos that exist (ADR 0085): the dashed "open seat" boxes are
  // gone now that partners have signed — the ask sits beside the logos, as the
  // last item of ONE row, instead of being implied by empty slots.
  const seats = sponsorSeats(sponsors, sponsors.length);
  const scrolls = sponsors.length >= SPONSOR_SEATS;
  const asking = sponsorCallOpen(call);

  return (
    <div
      className={`relative z-20 shrink-0 border-t-2 border-black02 bg-offwhite py-3.5 ${className}`}
      style={style}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 sm:px-8">
        <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
          {sponsors.length > 0 ? t("label") : t("labelEmpty")}
        </p>
      </div>

      <div
        className={`${scrolls ? `${marqueeTrack} overflow-hidden` : ""} mt-2.5`}
      >
        <div
          className={
            scrolls
              ? // No flex `gap` in the scrolling case — spacing is a per-item
                // margin so the -50% loop lands exactly on the seam.
                `${marqueeLoop} flex w-max items-center`
              : // Logos then the ask, never a scrollbar: an overflow axis would
                // also clip the hover lift. One row on a laptop; on a narrow
                // phone it wraps rather than scrolls.
                "mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-2 sm:gap-4 sm:px-8"
          }
        >
          <SponsorRow seats={seats} scrolls={scrolls} />

          {/*
            THE ASK, SIZED AND ALIGNED LIKE A SEAT (PHASE22 §A6) — not the
            pill-banner it used to be in the header row above, and placed
            LAST rather than first: it reads as "the next seat in line"
            after the logos and open seats, not as a banner ahead of them.
            It sits outside the scrolling track even while sponsors ARE
            scrolling (the track duplicates its contents for a seamless
            loop, and an "apply here" link should never render, or be
            tabbable, twice), but shares `EmptySeat`'s exact box so scanning
            the row lands on it exactly the way it would land on an open
            seat.
          */}
          {asking && (
            <SponsorCtaSeat url={call.prospectusUrl} label={t("cta")} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The sponsor-call CTA, styled to `EmptySeat`'s own box (h-11/sm:h-14,
 * min-w-24/sm:min-w-32, rounded-md) rather than a differently-sized banner —
 * "one more seat," per the brief, not a call-out. Solid border and a filled
 * background (not `EmptySeat`'s dashed outline) are the one deliberate
 * difference: this seat is clickable, and a real design shouldn't hide that.
 */
function SponsorCtaSeat({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-11 min-w-24 shrink-0 items-center justify-center gap-1.5 rounded-md border-2 border-black02 bg-primary px-4 font-sans text-caption font-bold text-black02 transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 motion-reduce:transform-none sm:h-14 sm:min-w-32 sm:px-6"
    >
      {label}
      <ArrowUpRight
        size={13}
        weight="bold"
        aria-hidden
        className="shrink-0 transition-transform duration-200 ease-bouncy group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
      />
    </a>
  );
}
