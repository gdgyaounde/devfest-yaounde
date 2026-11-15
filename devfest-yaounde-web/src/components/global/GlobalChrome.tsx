"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { navSettle } from "@/lib/motion";
import { announcementDismissKey } from "@/lib/announcement-key";
import { useBeforeInstant } from "@/lib/use-before-instant";
import { useSessionDismissed } from "@/lib/use-session-dismissed";
import { AnnouncementBanner } from "./AnnouncementBanner";
import type { NavSettings } from "@/lib/nav-tabs";
import { Navbar } from "./Navbar";

/**
 * DESIGN.md §7c: the announcement banner and the navbar are ONE connected
 * component — identical width, identical horizontal alignment, banner
 * attached directly to the top of the nav (the Claude.ai credit-notice
 * model). They must never read as two mismatched floating bars.
 *
 * The "more interesting than a plain pill" behaviour (§7c) is a real shape
 * morph: with the banner open the unit is a large rounded rectangle
 * (radius-lg); once the banner is dismissed or the page is scrolled, the
 * unit morphs into a full pill and tightens. Dismissal animates the banner
 * height to zero via the grid-template-rows 1fr->0fr technique, so the nav
 * smoothly reclaims the space instead of hard-jumping.
 */
export function GlobalChrome({
  announcementMessage,
  announcementCta,
  announcementExpiresAt,
  nav,
}: {
  announcementMessage?: string;
  announcementCta?: { href: string; label: string; external?: boolean };
  /**
   * When a DERIVED announcement stops being true — the sales-close line
   * (ADR 0072). Past it the banner folds away on the client, at the minute,
   * rather than waiting for the cron sweep to rebuild the static layout.
   */
  announcementExpiresAt?: string | null;
  /** Which navbar tabs are shown — from the dashboard (PHASE24). */
  nav: NavSettings;
}) {
  const tAnnouncement = useTranslations("announcement");
  /*
   * Dismissal is keyed by the MESSAGE, not by one fixed key. With a fixed
   * key, closing the banner once silenced every message that came after it
   * for the rest of the session — including the sales-close notice, which is
   * exactly the one that must not be missed. Closing it now hides only that
   * text; a new announcement shows again.
   */
  const shownText = announcementMessage ?? tAnnouncement("message");
  const [dismissed, dismiss] = useSessionDismissed(
    announcementDismissKey(shownText),
  );
  const current = useBeforeInstant(announcementExpiresAt, true);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  /*
   * The wall puts the bar at the BOTTOM.
   *
   * That page does not scroll and has no header of its own — the cards run
   * edge to edge and off the top, so a bar pinned up there would sit on the
   * busiest part of the screen. It also means the announcement cannot be
   * dismissed there: it is the page's only chrome, and a wall with nothing
   * on it but faces gives no way back.
   *
   * Read from the route rather than passed in, because the layout that
   * renders this is shared by every page and does not know which one it is.
   */
  const onWall = /^\/[a-z]{2}\/wall\/?$/.test(pathname ?? "");

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const bannerOpen = onWall || (!dismissed && current);
  /*
   * The shape morph is driven by the banner, not by scroll: with the banner
   * attached the unit is a tall card (radius-lg), and dismissing it morphs
   * the whole thing down into a single pill as the nav reclaims the space.
   * Keying this off scroll instead over-rounds the tall two-row box.
   */
  const pillShape = !bannerOpen;

  return (
    <header
      /* Named so the admin can suppress the site chrome without a tag
         selector that also hits the dashboard's own headers. */
      data-site-chrome
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3 sm:px-6 ${
        onWall ? "bottom-0 pb-3 sm:pb-5" : "top-0 pt-3 sm:pt-5"
      }`}
    >
      <div
        /*
         * PHASE10 §2 — the corners now BLEND to the pill instead of snapping.
         *
         * The old `rounded-pill` (999px) did animate, but a browser clamps a
         * border-radius to half the box's height, and the collapsed unit is
         * only ~78px tall. The specified value passed 39px within the first
         * frame of a 500ms tween, so every frame after that rendered the same
         * clamped 39px: a one-frame jump from 24px, i.e. a snap.
         *
         * Tweening to 2.5rem instead keeps the specified value in the range
         * the box can actually render, so the whole 24px -> 40px ramp is
         * visible. 40px still exceeds half the collapsed height, so the
         * settled shape is a true pill — and if the nav ever gets taller,
         * this degrades to a very rounded rectangle rather than breaking.
         */
        style={{ borderRadius: pillShape ? "2.5rem" : "1.5rem" }}
        className={`${navSettle} pointer-events-auto w-full max-w-5xl overflow-hidden border-2 border-black02 bg-offwhite transition-[border-radius,box-shadow,transform] duration-500 ease-bouncy ${
          scrolled
            ? "shadow-[0_6px_0_0_var(--color-black02)]"
            : "shadow-[0_3px_0_0_var(--color-black02)]"
        }`}
      >
        {/*
          grid-template-rows 1fr -> 0fr is the reliable way to animate an
          auto-height element to zero; the inner wrapper needs min-h-0 and
          overflow-hidden for it to actually clip.
        */}
        <div
          className="grid transition-[grid-template-rows] duration-400 ease-out-devfest motion-reduce:transition-none"
          style={{ gridTemplateRows: bannerOpen ? "1fr" : "0fr" }}
        >
          <div className="min-h-0 overflow-hidden">
            <AnnouncementBanner
              onDismiss={dismiss}
              hidden={!bannerOpen}
              dismissible={!onWall}
              messageKey={onWall ? "wall" : undefined}
              messageOverride={onWall ? undefined : announcementMessage}
              cta={onWall ? undefined : announcementCta}
            />
          </div>
        </div>

        <Navbar compact={scrolled} nav={nav} />
      </div>
    </header>
  );
}
