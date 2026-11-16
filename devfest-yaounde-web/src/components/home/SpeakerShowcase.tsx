"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { SpeakerCard } from "@/components/speakers/SpeakerCard";
import type { Speaker } from "@/data/types";

/** Alternating resting tilt so the spotlight rotation isn't uniform. */
const CARD_TILT = [-2.5, 2, -1.5, 2.5];

/** Past this much horizontal drag, releasing moves to the next card. */
const DRAG_COMMIT_PX = 60;
/** Movement under this is a tap, not a drag — fingers are never perfectly still. */
const CLICK_SLOP_PX = 8;

const AUTO_ADVANCE_MS = 3800;

/**
 * Speaker slider — PHASE7 §5 rework.
 *
 * BEFORE: a centered, container-constrained horizontal scroll area whose
 * `overflow-x: auto` clipped the cards' hover transforms, opening a modal
 * on click.
 *
 * AFTER:
 *  1. Full viewport width — the track breaks out of the page container.
 *  2. Spotlight + rotate on focus; siblings recede and dim.
 *  3. Click swipes a detail panel UP over the card's own image. No modal.
 *  4. Social links live in that panel, rendered only when provided.
 *  5. No scrollbar — prev/next controls drive a transform-based track.
 *  6. Auto-advance every ~3.8s, paused on hover/focus/interaction and
 *     disabled entirely under prefers-reduced-motion.
 *
 * THE CROP FIX (§5.1): a horizontal track needs `overflow-x: hidden`, but
 * CSS forces the other axis to `auto` the moment one axis is hidden — so a
 * card scaling/rotating on hover was being clipped vertically. Fixed by
 * giving the clipping element generous vertical padding, so the scaled card
 * never reaches the clip edge. There is no `overflow-x: hidden;
 * overflow-y: visible` combination that works here.
 */
export function SpeakerShowcase({ speakers }: { speakers: Speaker[] }) {
  const t = useTranslations("home.speakers");
  /*
   * TODAY'S SPOTLIGHT (ADR 0073). The page picks these on the server —
   * featured speakers pinned first, the rest a fair daily rotation seeded by
   * Yaoundé's date (`pickSpotlight`) — so this component just shows what it
   * is given. It used to show `featured` speakers only and render nothing
   * when none were flagged, which with a real lineup and no flags meant an
   * empty front page.
   */
  const featured = speakers;

  const [focused, setFocused] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Live-tracked, not just read once — users can flip the OS setting.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Centre the focused card by MEASURING it. Card width (w-72 -> sm:w-88)
  // and gap (gap-8 -> sm:gap-10) both change at the breakpoint, so any
  // hardcoded rem step desyncs from the track padding at some widths.
  const [offset, setOffset] = useState(0);
  const recentre = useCallback(() => {
    const track = trackRef.current;
    const card = track?.children[focused] as HTMLElement | undefined;
    if (!track || !card) return;
    const viewport = track.parentElement;
    if (!viewport) return;
    setOffset(
      viewport.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2),
    );
  }, [focused]);

  useEffect(() => {
    recentre();
    window.addEventListener("resize", recentre);
    return () => window.removeEventListener("resize", recentre);
  }, [recentre]);

  const go = useCallback(
    (dir: 1 | -1) => {
      setOpenId(null);
      setFocused((i) => (i + dir + featured.length) % featured.length);
    },
    [featured.length],
  );

  /*
   * Drag / swipe — PHASE11 §7. Matches the page slider's input handling:
   * Pointer Events, so mouse, touch and pen share one code path, and a
   * commit threshold rather than free scrolling (the track snaps to a
   * centred card, so a free-running drag would fight the recentre).
   *
   * `touch-action: pan-y` keeps vertical page scrolling with the page — we
   * only claim the horizontal axis, which is the one the track uses.
   */
  const drag = useRef<{ startX: number; pointerId: number } | null>(null);
  /** Set once a press has travelled far enough to be a drag, not a click. */
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  /*
   * Auto-advance stops for good once someone touches the reel.
   *
   * Hover already paused it, which covers a mouse — but a touch device has no
   * hover, so the carousel kept sliding under a finger that was reaching for
   * a card. Taking over on the first pointer contact is the honest reading of
   * intent: they are driving now.
   */
  const [userTookOver, setUserTookOver] = useState(false);

  /*
   * Drag starts on the CARD too, not just in the gaps between cards.
   *
   * This is why dragging never worked here: every card is a <button>, so the
   * old `closest("a,button")` guard matched on essentially every press and
   * bailed out before a drag could begin. Instead of refusing to start, the
   * press is tracked and a real drag SUPPRESSES the click that follows (see
   * onClickCapture) — so dragging moves the reel and tapping still opens a
   * card, which is what both gestures should do.
   */
  function onPointerDown(e: React.PointerEvent) {
    drag.current = { startX: e.clientX, pointerId: e.pointerId };
    movedRef.current = false;
    setDragging(true);
    setUserTookOver(true);
    // NB: the pointer is deliberately NOT captured here — see onPointerMove.
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) <= CLICK_SLOP_PX) return;

    /*
     * Capture the pointer only once this is definitely a DRAG.
     *
     * Capturing on pointerdown broke every tap: with a capture active at
     * pointerup the browser retargets the resulting click to the capturing
     * element, so the click never reached the card's own button and cards
     * stopped opening. Capturing late keeps taps intact and still gives the
     * drag reliable tracking once it has started.
     */
    if (!movedRef.current) {
      movedRef.current = true;
      (e.currentTarget as Element).setPointerCapture(d.pointerId);
    }
  }

  /** Swallow the click a drag would otherwise fire on the card underneath. */
  function onClickCapture(e: React.MouseEvent) {
    if (!movedRef.current) return;
    movedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture?.(d.pointerId))
      el.releasePointerCapture(d.pointerId);
    drag.current = null;
    setDragging(false);
    if (Math.abs(dx) > DRAG_COMMIT_PX) go(dx < 0 ? 1 : -1);
  }

  // Auto-advance. Never runs for reduced-motion users, and pauses whenever
  // the user is hovering, focused inside, or has a detail panel open.
  useEffect(() => {
    if (reduceMotion || paused || userTookOver || openId !== null) return;
    const id = setInterval(() => {
      setFocused((i) => (i + 1) % featured.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [reduceMotion, paused, userTookOver, openId, featured.length]);

  /*
   * AN EMPTY REEL CANNOT BE RENDERED: every navigation here is `(i + n) % n`,
   * and with nothing featured that is a division by zero producing NaN, which
   * React then writes into a transform.
   *
   * The home page no longer relies on this to handle "no speakers yet" — it
   * renders the call for speakers instead of this section when the store is
   * empty. What is left is the last case that still reaches here: an
   * organiser who forced the call off before entering anyone, where showing
   * nothing is exactly what they asked for.
   */
  if (featured.length === 0) return null;

  return (
    <section className="overflow-hidden bg-pastel py-24 sm:py-32 lg:py-40">
      {/* Heading stays within the normal page measure */}
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="inline-flex -rotate-2 items-center rounded-pill border-2 border-black02 bg-primary px-4 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02 shadow-[0_3px_0_0_var(--color-black02)]">
                {t("spotlight")}
              </p>
              <h2 className="mt-5 font-sans text-display-xl font-bold text-black02">
                {t("title")}
              </h2>
              <p className="mt-4 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                {t("spotlightHint")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={t("prev")}
                className="flex h-14 w-14 items-center justify-center rounded-pill border-2 border-black02 bg-offwhite text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-[transform,background-color,box-shadow] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary hover:shadow-[0_6px_0_0_var(--color-black02)] active:translate-y-0.5 active:shadow-none"
              >
                <CaretLeft size={24} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={t("next")}
                className="flex h-14 w-14 items-center justify-center rounded-pill border-2 border-black02 bg-offwhite text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-[transform,background-color,box-shadow] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary hover:shadow-[0_6px_0_0_var(--color-black02)] active:translate-y-0.5 active:shadow-none"
              >
                <CaretRight size={24} weight="bold" />
              </button>
            </div>
          </div>
        </Reveal>
      </div>

      {/*
        Full-bleed track. py-16 is the crop fix — it gives the scaled/rotated
        focused card room inside the clipping box.
      */}
      <div
        className="mt-12 w-full touch-pan-y select-none overflow-hidden py-16"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        data-cursor="grab"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        <div
          ref={trackRef}
          data-spotlight="on"
          className="speaker-track flex w-max items-center gap-8 transition-transform duration-700 ease-out-devfest motion-reduce:transition-none sm:gap-10"
          style={{ transform: `translateX(${offset}px)` }}
        >
          {featured.map((s, i) => (
            <SpeakerCard
              key={s.id}
              speaker={s}
              open={openId === s.id}
              onToggle={() => {
                setFocused(i);
                setOpenId(openId === s.id ? null : s.id);
              }}
              focused={i === focused}
              tilt={CARD_TILT[i % CARD_TILT.length]}
              /* Home is a teaser: name, role, company, bio, socials only.
                 The icebreaker and funny moment live on /speakers, where
                 someone has actually asked for the detail (PHASE11 §7). */
              personality={false}
              profileHref={`/speakers?spk=${encodeURIComponent(s.id)}`}
              className="w-72 shrink-0 sm:w-88"
            />
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Button tone="black02" variant="secondary" href="/speakers" size="md">
          {t("cta")}
        </Button>
      </div>
    </section>
  );
}
