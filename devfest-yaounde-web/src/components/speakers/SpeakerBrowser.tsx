"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PersonSlider } from "@/components/people/PersonSlider";
import { FilterGroup } from "@/components/ui/FilterGroup";
import { FilterLayout } from "@/components/ui/FilterLayout";
import { Reveal } from "@/components/ui/Reveal";
import { ViewToggle, type PersonView } from "@/components/ui/ViewToggle";
import { chooseSide, type PopoverSide } from "@/lib/popover-anchor";
import { SpeakerCard } from "./SpeakerCard";
import type { SpeakerWithTalks } from "@/data/types";

const TILT = [-2, 1.5, -1, 2];

/**
 * /speakers — filters + dual views (PHASE9 §2/§3/§4).
 *
 * Search and both filter dimensions live in the shared `FilterLayout`
 * (sticky sidebar on desktop, bottom drawer on mobile), grouped under
 * labelled `FilterGroup`s rather than a flat pile of chips.
 *
 * Grid and Slider filter the SAME derived list, so switching view never
 * changes what's in scope. The focused person is preserved across the
 * switch too: the grid's open card and the slider's index are kept in sync
 * through one `focusedId`, so you land on the person you were looking at.
 */
export function SpeakerBrowser({ speakers }: { speakers: SpeakerWithTalks[] }) {
  const t = useTranslations("pages.speakers");
  const tf = useTranslations("common.filters");
  const locale = useLocale() as "fr" | "en";
  const searchParams = useSearchParams();

  const [view, setView] = useState<PersonView>("grid");
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);

  /**
   * Which side the open card's popover opens toward. Measured in the click
   * handler (see popover-anchor.ts) — never in an effect or during render.
   */
  const [side, setSide] = useState<PopoverSide>("right");

  const [focusedId, setFocusedId] = useState<string | null>(null);

  /**
   * Deep link (`?spk=<id>` — the home reel's "Full profile" links here).
   *
   * Resolved once, but OPENED after mount rather than in the initial state:
   * the popover's side can only be measured once the card is laid out, and
   * opening it straight from state put a last-column card's popover off the
   * right edge of the screen. So, one frame after mount: measure the side,
   * open the card, bring it to the middle of the screen and give it keyboard
   * focus — arriving from a link should not mean hunting for the person.
   * The state updates run in the frame callback, not the effect body.
   *
   * The scroll waits for the splash preloader to leave: it locks page scroll
   * on a fresh visit, so scrolling under it was silently undone.
   */
  const deepLink = useRef<string | null>(null);
  if (deepLink.current === null) {
    const spk = searchParams.get("spk");
    deepLink.current = spk && speakers.some((s) => s.id === spk) ? spk : "";
  }
  useEffect(() => {
    const id = deepLink.current;
    if (!id) return;
    let poll: number | undefined;
    const frame = requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(
        `[data-card-grid] [data-speaker-id="${CSS.escape(id)}"]`,
      );
      setSide(chooseSide(card));
      setFocusedId(id);
      if (!card) return;
      const bringIntoView = () => {
        if (document.querySelector("[data-preloader]")) return;
        window.clearInterval(poll);
        const reduce = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        card.scrollIntoView({
          block: "center",
          behavior: reduce ? "auto" : "smooth",
        });
        card.querySelector("button")?.focus({ preventScroll: true });
      };
      poll = window.setInterval(bringIntoView, 150);
      bringIntoView();
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(poll);
    };
  }, []);

  const tracks = useMemo(
    () => [...new Set(speakers.map((s) => s.track[locale]))].sort(),
    [speakers, locale],
  );
  const days = useMemo(
    () => [...new Set(speakers.map((s) => s.day))].sort((a, b) => a - b),
    [speakers],
  );

  const visible = speakers
    .filter((s) =>
      query.trim()
        ? s.name.toLowerCase().includes(query.trim().toLowerCase())
        : true,
    )
    .filter((s) => (track ? s.track[locale] === track : true))
    .filter((s) => (day ? String(s.day) === day : true));

  const activeCount = (query.trim() ? 1 : 0) + (track ? 1 : 0) + (day ? 1 : 0);

  function clearAll() {
    setQuery("");
    setTrack(null);
    setDay(null);
  }

  /** Keep the URL shareable without a navigation or scroll jump. */
  function writeUrl(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("spk", id);
    else url.searchParams.delete("spk");
    window.history.replaceState(null, "", url);
  }

  /**
   * Accordion: one card open at a time. `focusedId` is a single value, so
   * opening a second card closes the first by construction rather than by a
   * cleanup pass that could get out of step.
   */
  function toggleCard(id: string, card: Element | null) {
    const next = focusedId === id ? null : id;
    if (next) setSide(chooseSide(card));
    setFocusedId(next);
    writeUrl(next);
  }

  function closeCard() {
    setFocusedId(null);
    writeUrl(null);
  }

  // Escape and click-outside close the open popover — it overlays the grid,
  // so it needs the same dismissal affordances as any other overlay.
  useEffect(() => {
    if (!focusedId || view !== "grid") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeCard();
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element;
      /*
       * The mobile detail sheet is PORTALLED to <body>, so it is not inside
       * `.speaker-card.is-open` — without the second test, every touch
       * *inside* the sheet counted as an outside click and dismissed it the
       * moment it opened. The sheet handles its own scrim tap and Escape.
       */
      if (target.closest('[role="dialog"]')) return;
      if (!target.closest(".speaker-card.is-open")) closeCard();
    }
    // The grid reflows on resize (columns come from available width), so a
    // card that had room on its right may not any more: re-measure.
    function onResize() {
      setSide(
        chooseSide(
          document.querySelector(
            `[data-card-grid] [data-speaker-id="${CSS.escape(focusedId!)}"]`,
          ),
        ),
      );
    }
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKeyDown);
    // Capture phase: a card's own click handler would otherwise reopen it
    // in the same gesture that this closes.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, view]);

  // Slider index derives from the shared focusedId, so the view switch keeps
  // your place. Falls back to 0 when the focused person is filtered out.
  const sliderIndex = Math.max(
    0,
    visible.findIndex((s) => s.id === focusedId),
  );

  const filters = (
    <>
      <div className="relative">
        <MagnifyingGlass
          size={18}
          weight="bold"
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black02/65"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("searchLabel")}
          className="w-full rounded-pill border-2 border-black02 bg-offwhite py-2.5 pl-11 pr-4 text-body-m text-black02 placeholder:text-black02/45"
        />
      </div>

      <FilterGroup
        label={t("trackLabel")}
        selected={track}
        onSelect={setTrack}
        options={[
          { value: null, label: t("allTracks") },
          ...tracks.map((tr) => ({ value: tr, label: tr })),
        ]}
      />

      {/* A one-day edition (ADR 0071) has nothing to filter by day. */}
      {days.length > 1 && (
        <FilterGroup
          label={t("dayLabel")}
          selected={day}
          onSelect={setDay}
          options={[
            { value: null, label: t("allDays") },
            ...days.map((d) => ({
              value: String(d),
              label: t("day", { day: d }),
            })),
          ]}
        />
      )}
    </>
  );

  return (
    <FilterLayout
      filters={filters}
      activeCount={activeCount}
      onClearAll={clearAll}
      toolbar={<ViewToggle view={view} onChange={setView} />}
    >
      <p
        aria-live="polite"
        className="mb-8 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65"
      >
        {t("results", { count: visible.length })}
      </p>

      {/*
        PHASE13 §2: the slider is a LOCKED TAKEOVER over the grid, not an
        alternative to it. The grid stays mounted underneath, so dismissing
        the lockup returns to exactly the grid you left — same scroll
        position, same filters, no remount.
      */}
      {view === "slider" && (
        <PersonSlider
          people={visible}
          index={sliderIndex}
          onIndexChange={(i) => {
            const next = visible[i]?.id ?? null;
            setFocusedId(next);
            writeUrl(next);
          }}
          emptyLabel={t("noResults")}
          onClose={() => {
            setView("grid");
            // Dismissing the lockup also drops the focus, so you land on a
            // clean grid rather than one card still singled out.
            setFocusedId(null);
            writeUrl(null);
          }}
          title={t("title")}
          closeLabel={tf("close")}
        />
      )}

      {visible.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-black02/30 px-7 py-16 text-center text-body-l text-black02/70">
          {t("noResults")}
        </p>
      ) : (
        /*
         * 4 columns at xl — the floating filter rail takes no width from the
         * grid (PHASE10 §1). `data-card-grid` is what popover-anchor.ts
         * measures against to decide which way a card opens.
         */
        <div
          data-card-grid
          /* Dims the non-focused cards while one is open (PHASE12 §7). */
          data-card-open={view === "grid" && focusedId !== null}
          /* Columns come from available width, not the viewport — see
             [data-card-grid] in globals.css.

             16rem, not 17: auto-fill counts the 2rem gap in each track, so
             the real divisor is min+gap. 16rem gives 4 columns at the full
             1216px content width and 3 once the panel pushes it to 872px;
             17rem dropped straight to 2. */
          style={{ ["--card-min" as string]: "16rem" }}
          className="grid items-start gap-8"
        >
          {visible.map((s, i) => (
            <Reveal
              key={s.id}
              index={i % 3}
              /* The Reveal IS the grid item, so the open card's stacking
                 context has to be lifted here — `.anim-reveal` carries a
                 transform, which makes each wrapper its own stacking
                 context and would otherwise let later siblings paint over
                 the popover. */
              className={focusedId === s.id ? "relative z-30" : ""}
            >
              <SpeakerCard
                speaker={s}
                /*
                 * Scoped to GRID view. `focusedId` does double duty — it is
                 * the slider's index as well as the grid's open card — and
                 * the grid stays mounted under the lockup. Without this,
                 * advancing the slider opened the card underneath too: on
                 * mobile that is a portalled bottom sheet at z-100, so it
                 * landed on top of the lockup and looked exactly like having
                 * tapped the card instead of the next button.
                 */
                open={view === "grid" && focusedId === s.id}
                onToggle={(card) => toggleCard(s.id, card)}
                onClose={closeCard}
                tilt={TILT[i % TILT.length]}
                popover
                side={side}
              />
            </Reveal>
          ))}
        </div>
      )}
    </FilterLayout>
  );
}
