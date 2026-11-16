"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { modalBackdropIn, modalPopIn } from "@/lib/motion";
import { lockScroll } from "@/lib/scroll-source";

/**
 * "Has this hydrated yet?"
 *
 * The portal needs `document`, which does not exist while the server renders
 * — and a modal CAN be open on first paint (arriving straight at
 * /shop/[product] opens its drawer), so the guard has to be real rather than
 * theoretical: without it that route fails to prerender outright.
 *
 * `useSyncExternalStore` rather than the usual `useState` + `useEffect`:
 * that pattern is a setState in an effect body, which this codebase's lint
 * rejects, and this is precisely the "external, non-reactive" read the hook
 * exists for. The subscribe function never fires because the answer never
 * changes after hydration.
 */
const subscribeNoop = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type ModalVariant =
  "dialog" | "takeover" | "drawer-left" | "drawer-right";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Accessible name for the dialog — falls back to an auto-generated id if omitted. */
  labelledBy?: string;
  className?: string;
  /** Localize this — the shell has no translation context of its own. */
  closeLabel?: string;
  /**
   * `dialog` (default): a centred, max-width panel — the classic modal.
   *
   * `takeover`: a TRUE full-screen surface. It covers the entire viewport
   * including the navbar, and carries no panel chrome of its own — the
   * content sits directly on a blurred scrim so nothing competes with it.
   * Used by the slider lockup.
   *
   * `drawer-left`: a full-height panel that slides in from the left edge,
   * over a scrim. The filter surface on laptops and desktops (PHASE14 §1).
   * It replaced a rail that floated in the page margin — that approach
   * needed more horizontal room than a 14" laptop has, so on the machine
   * most people actually use, the filters simply did not render.
   *
   * `drawer-right`: a FLOATING card that slides in from the right — product
   * detail in the shop. Right rather than left because it is a detail *of*
   * something you just clicked, and the reading order puts the follow-up on
   * the side you finish on.
   *
   * It is detached from every edge and fully rounded, over a blurred scrim,
   * rather than glued to the right edge. On a phone it becomes a full-bleed
   * sheet instead, because a floating card inside a 390px screen is mostly
   * margin.
   */
  variant?: ModalVariant;
  /**
   * Takeover only: also request the browser's Fullscreen API on open and
   * release it on close.
   *
   * This is best-effort by design. The request needs a live user activation
   * and can be refused outright (an iframe without `allow="fullscreen"`, a
   * browser policy, a user who said no), so a rejection is swallowed: the
   * in-app overlay already covers the viewport, and the experience degrades
   * to "full-screen within the tab" rather than breaking.
   *
   * Leaving fullscreen by any route the browser owns — Esc, F11, the OS —
   * closes the overlay too, so the two can never disagree about what the
   * user is looking at.
   */
  browserFullscreen?: boolean;
}

/**
 * Generic overlay shell: portal, focus trap, escape-to-close, backdrop-click
 * close, body scroll lock.
 *
 * PHASE13 §2 extended this with a `takeover` variant rather than building a
 * second overlay system for the slider lockup. Everything the lockup needs —
 * portal, focus trap, Escape, backdrop dismiss, scroll lock, focus
 * restoration — already lived here and was otherwise unused; duplicating it
 * would have meant two focus traps to keep correct instead of one.
 * DESIGN.md/PAGES.md §4.2 asks for a shared-element
 * "grows from the clicked card" transition — this shell instead uses a
 * centered scale+fade (DESIGN.md §6.1 maps "modal open" to ease-out, meso
 * tier), which is the honest scope for a *generic* shell with no knowledge
 * of any specific trigger card. A true shared-element/FLIP transition needs
 * either an origin rect wired in by the caller or an animation library
 * (flagged, not installed) — worth revisiting once the Speaker Modal
 * (Phase 4) has a real card to originate from. See docs/components/modal.md.
 */
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  className = "",
  closeLabel = "Close",
  variant = "dialog",
  browserFullscreen = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;

  /*
   * The latest onClose, held in a ref so the effects below do NOT depend on
   * its identity.
   *
   * This was a real bug, not a micro-optimisation. Callers pass an inline
   * arrow (`onClose={() => setView("grid")}`), which is a new function on
   * every render. With `onClose` in the dependency array, every slide change
   * tore the effects down and rebuilt them — which called `exitFullscreen()`
   * in cleanup and then re-requested fullscreen with no user activation left
   * to spend, so the request was refused. Worse, the exit's async
   * `fullscreenchange` could land after the new listener attached, which read
   * as "the user left fullscreen" and closed the slider outright. Pressing
   * next dropped you back to the grid.
   *
   * A ref fixes it here rather than requiring every caller to remember
   * useCallback.
   */
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    clientSnapshot,
    serverSnapshot,
  );
  const onCloseRef = useRef(onClose);
  // Synced in an effect, not during render — writing a ref while rendering is
  // exactly what `react-hooks/refs` forbids, and it would tear under
  // concurrent rendering.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current =
      document.activeElement as HTMLElement | null;
    // Routed through the shared scroll seam (`src/lib/scroll-source.ts`)
    // rather than toggling `overflow: hidden` here directly — that seam is
    // what lets locks nest correctly when one overlay opens over another.
    const releaseScroll = lockScroll();

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    // A field marked `data-autofocus` wins (a dialog whose whole point is
    // one input); otherwise the first focusable, as before.
    (
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      focusable?.[0] ??
      panel
    )?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      releaseScroll();
      previousActiveElement.current?.focus();
    };
  }, [open]);

  // Browser fullscreen, kept in sync with the overlay in both directions.
  useEffect(() => {
    if (!open || !browserFullscreen) return;
    const root = document.documentElement;

    // Rejections are expected and harmless — see the prop's doc comment.
    root.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});

    function onFullscreenChange() {
      // The user left fullscreen through the browser (Esc, F11, the OS).
      // Close the overlay so the two never disagree.
      if (!document.fullscreenElement) onCloseRef.current();
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement)
        document.exitFullscreen?.().catch(() => {});
    };
  }, [open, browserFullscreen]);

  if (!open || !hydrated) return null;

  const takeover = variant === "takeover";
  const drawerLeft = variant === "drawer-left";
  const drawerRight = variant === "drawer-right";
  const drawer = drawerLeft || drawerRight;

  return createPortal(
    <div
      className={
        takeover
          ? // Covers EVERYTHING, navbar included. z-100 clears the chrome
            // (z-50) and the floating scrollbar (z-60); the custom cursor
            // stays above at 9999, which is correct — it must never be
            // occluded by what it is pointing at.
            "fixed inset-0 z-100 flex items-stretch justify-center p-4 sm:p-6"
          : drawerLeft
            ? "fixed inset-0 z-100 flex items-stretch justify-start"
            : drawerRight
              ? // Padding is what detaches the card from the screen on
                // desktop; a phone gets none, so the sheet is full-bleed.
                "fixed inset-0 z-100 flex items-stretch justify-end sm:p-5 lg:p-7"
              : "fixed inset-0 z-100 flex items-center justify-center p-4"
      }
    >
      <div
        aria-hidden
        onClick={onClose}
        className={`${modalBackdropIn} absolute inset-0 ${
          takeover
            ? // Blur is what pulls focus onto the content: the page behind
              // stays legible as context but stops competing for attention.
              // A flat scrim over a blur — no gradient (DESIGN.md §2.6).
              "bg-black02/80 backdrop-blur-md"
            : drawer
              ? "bg-black02/50 backdrop-blur-sm"
              : "bg-black02/50"
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={
          takeover
            ? // NO panel chrome — no card, no border, no background. The
              // content sits straight on the blurred scrim and gets the
              // whole screen, which is the point of a takeover.
              `${modalPopIn} takeover-panel relative flex w-full max-w-[110rem] flex-col ${className}`
            : drawerLeft
              ? // Flush to the left edge: square there, rounded on the side
                // that is visible, so it reads as attached to the screen
                // rather than floating. No sharp corners anywhere it shows.
                `anim-drawer-left relative flex h-full w-[min(22rem,88vw)] flex-col overflow-hidden rounded-r-lg border-y-2 border-r-2 border-black02 bg-offwhite p-6 ${className}`
              : drawerRight
                ? // Wider than the filter drawer — it carries an image and a
                  // description, not a list of chips. Same edge logic,
                  // mirrored: rounded only on the side that shows.
                  //
                  // A FLOATING CARD (PHASE16 §1), not a panel glued to the
                  // edge: rounded on all four corners, bordered all the way
                  // round, and held off every edge by the wrapper's padding.
                  //
                  // FULL-BLEED ON A PHONE. At `min(34rem,94vw)` it left a 6%
                  // sliver of scrim down one side, which reads as a
                  // misaligned panel rather than a margin, and 390px has none
                  // to spare — so the phone gets the whole screen, still
                  // rounded so no corner is sharp.
                  //
                  // `overflow-hidden` with the body scrolling INSIDE, so the
                  // close button stays pinned. It used to scroll away with
                  // the content, which on a long product left no way out but
                  // Escape or a scroll back up.
                  `anim-drawer-right relative flex h-full w-full flex-col overflow-hidden rounded-lg border-2 border-black02 bg-offwhite shadow-[0_10px_0_0_var(--color-black02)] sm:w-[min(34rem,94vw)] ${className}`
                : `${modalPopIn} relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-offwhite p-6 sm:p-8 ${className}`
        }
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className={
            takeover
              ? "absolute right-0 top-0 z-10 rounded-pill border-2 border-offwhite/40 bg-black02/60 p-2.5 text-offwhite transition-colors hover:border-offwhite hover:bg-offwhite hover:text-black02"
              : drawer
                ? "absolute right-4 top-5 z-20 rounded-pill border-2 border-black02 bg-offwhite p-1.5 text-black02 transition-colors hover:bg-primary"
                : "absolute right-4 top-4 rounded-pill p-1.5 text-black02 transition-colors hover:bg-black02/10"
          }
        >
          <X size={20} weight={takeover ? "bold" : "regular"} />
        </button>
        {drawerRight ? (
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        ) : (
          children
        )}
      </div>
    </div>,
    document.body,
  );
}
