"use client";

import { X } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { PersonDetail } from "@/components/people/PersonDetail";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MOBILE_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { MorphedImageFrame } from "@/components/ui/MorphedImageFrame";
import type { PopoverSide } from "@/lib/popover-anchor";
import type { SpeakerWithTalks } from "@/data/types";

export interface SpeakerCardProps {
  speaker: SpeakerWithTalks;
  open: boolean;
  /**
   * Receives the card's own root element so the grid can measure which way
   * the popover should open before it opens. Passing the node beats a ref
   * in the parent: the parent renders N cards and would need N refs.
   */
  onToggle: (card: Element | null) => void;
  onClose?: () => void;
  /** Resting tilt applied when this card is the spotlight focus. */
  tilt?: number;
  focused?: boolean;
  /**
   * Grid mode: opening pops the detail out BESIDE the card as an overlay, so
   * the grid never reflows. The slider leaves this off — there the card is
   * the stage and the detail swipes up over it.
   */
  popover?: boolean;
  /** Which way the popover opens; measured by the grid at click time. */
  side?: PopoverSide;
  /** Off on the home teaser — see `PersonDetail.personality`. */
  personality?: boolean;
  /** Home teaser: clamp the bio and link here — see `PersonDetail.profileHref`. */
  profileHref?: string;
  className?: string;
}

/**
 * One speaker card with its detail reveal.
 *
 * Extracted from the Home slider in PHASE8 so the full `/speakers` grid uses
 * the SAME interaction rather than a second, divergent modal implementation
 * (see docs/decisions/0009-speaker-interaction.md).
 *
 * TWO PRESENTATIONS, AND THEIR DOM PLACEMENT DIFFERS — this matters:
 *
 * - Slider (`popover` off): the panel swipes UP over the card's own image,
 *   so it must live INSIDE the frame, which clips it. Rendering it as a
 *   sibling of the frame instead was a real bug (PHASE12 §5): the closed
 *   panel is only translated out of view, so with nothing clipping it, every
 *   card's panel painted just below it and the detail appeared to be open on
 *   all of them at once.
 * - Grid (`popover` on): the panel opens BESIDE the card and must ESCAPE the
 *   frame, so it is a sibling and nothing on the path may clip it.
 *
 * In both, the panel stays mounted and `inert` keeps its contents out of the
 * tab order and accessibility tree while closed.
 */
export function SpeakerCard({
  speaker,
  open,
  onToggle,
  onClose,
  tilt = -2,
  focused = false,
  popover = false,
  side = "right",
  personality = true,
  profileHref,
  className = "",
}: SpeakerCardProps) {
  const locale = useLocale() as "fr" | "en";
  const t = useTranslations("common.filters");
  /*
   * PHASE13 §5: on mobile the detail opens in the SHARED bottom sheet
   * instead of a side popover. There is no room beside a card on a phone,
   * and the sheet is the pattern this site already uses for filters — so
   * mobile gets one familiar interaction rather than two.
   */
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const sheetMode = popover && isMobile;

  const body = (
    <PersonDetail
      person={speaker}
      tone={sheetMode ? "light" : "dark"}
      interactive={open}
      personality={personality}
      profileHref={profileHref}
    />
  );

  const detail = (
    <div
      id={`speaker-detail-${speaker.id}`}
      inert={!open}
      /*
       * The swipe-up panel's content is BOTTOM-aligned (`justify-end`): it
       * rises from the card's lower edge and lands where the resting caption
       * was, so the eye stays put. Top-aligning it left the text floating
       * above a pool of empty scrim on shorter bios.
       *
       * Bottom-aligned with `mt-auto` on the content, NOT `justify-end`:
       * `justify-end` on an overflowing scroll box puts the excess above the
       * scroll origin, where it cannot be scrolled to — a long bio pushed the
       * name and role out of reach.
       */
      className={
        popover
          ? "person-pop scroll-on-dark rounded-lg border-2 border-black02 bg-black02 px-6 py-6 text-left shadow-[0_8px_0_0_var(--color-black02)]"
          : "speaker-detail scroll-on-dark absolute inset-0 flex flex-col overflow-y-auto bg-black02/92 px-6 py-6 text-left"
      }
    >
      {popover && (
        <button
          type="button"
          onClick={(e) =>
            onClose ? onClose() : onToggle(e.currentTarget.closest("article"))
          }
          aria-label={t("close")}
          className="absolute right-4 top-4 rounded-pill border-2 border-offwhite/45 p-1.5 text-offwhite transition-colors hover:bg-offwhite hover:text-black02"
        >
          <X size={16} weight="bold" />
        </button>
      )}
      {popover ? body : <div className="mt-auto">{body}</div>}
    </div>
  );

  return (
    <article
      data-speaker-id={speaker.id}
      className={`speaker-card relative ${focused ? "is-focused" : ""} ${
        open ? "is-open" : ""
      } ${popover ? "is-popover" : ""} ${
        open && popover ? `is-open-${side}` : ""
      } ${className}`}
      style={{ ["--card-tilt" as string]: `${tilt}deg` }}
    >
      <button
        type="button"
        onClick={(e) => onToggle(e.currentTarget.closest("article"))}
        aria-expanded={open}
        aria-controls={`speaker-detail-${speaker.id}`}
        className="block w-full text-left"
      >
        <div className="relative overflow-hidden rounded-lg border-2 border-black02 shadow-[0_6px_0_0_var(--color-black02)]">
          <MorphedImageFrame
            src={speaker.photoUrl}
            alt={speaker.name}
            aspectRatio="4/5"
            className="rounded-none border-0"
          />

          {/* Resting caption. In the slider it fades out behind the swipe-up
              panel; in the grid it stays, because the detail sits beside the
              card rather than over it. */}
          <div
            className={`absolute inset-x-0 bottom-0 bg-offwhite px-5 py-4 transition-opacity duration-200 ${
              open && !popover ? "opacity-0" : "opacity-100"
            }`}
          >
            <p className="font-sans text-heading-m font-bold leading-tight text-black02">
              {speaker.name}
            </p>
            <p className="mt-1 truncate text-body-m text-black02/70">
              {speaker.role[locale]}
            </p>
          </div>

          {/* Slider: inside the frame, which clips the closed panel. */}
          {!popover && detail}
        </div>
      </button>

      {/* Grid, desktop: a popover outside the frame, so it can escape it. */}
      {popover && !isMobile && detail}

      {/* Grid, mobile: the shared bottom sheet. */}
      {sheetMode && (
        <BottomSheet
          open={open}
          onClose={() => (onClose ? onClose() : onToggle(null))}
          title={speaker.name}
          /* A circle avatar stands in for the header's name text — the
             detail body already opens with the name, and printing it twice
             read as a mistake. */
          titleVisual={
            <MorphedImageFrame
              src={speaker.photoUrl}
              alt=""
              shape="circle"
              aspectRatio="1/1"
              className="h-20 w-20 shrink-0 border-2 border-black02"
            />
          }
          closeLabel={t("close")}
        >
          {body}
        </BottomSheet>
      )}
    </article>
  );
}
