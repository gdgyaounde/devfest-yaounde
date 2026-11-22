"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * "Has this browser already seen X?" — remembered in localStorage (ADR 0074).
 *
 * Same `useSyncExternalStore` shape as `use-session-dismissed.ts`, with the
 * storage guarding of `use-cart.ts`: every access is in try/catch, because
 * private mode, blocked site data and some embedded browsers throw on
 * storage access rather than returning null.
 *
 * WHEN STORAGE IS UNAVAILABLE it degrades in steps, never to "every page":
 *   localStorage → sessionStorage (once per session) → memory (once per page
 *   lifetime — which, since the root layout never remounts on client
 *   navigation, still means once while someone browses the site).
 *
 * The SERVER snapshot is `true` ("seen"), so nothing gated on this renders in
 * the HTML or during hydration; it can only appear after the client has
 * actually checked.
 *
 * A boolean snapshot is stable by value, so no caching is needed to avoid a
 * render loop.
 */
const memory = new Set<string>();
const listeners = new Set<() => void>();

function readSeen(key: string): boolean {
  if (memory.has(key)) return true;
  try {
    if (window.localStorage.getItem(key) === "1") return true;
  } catch {
    // Blocked — fall through to the next store.
  }
  try {
    if (window.sessionStorage.getItem(key) === "1") return true;
  } catch {
    // Blocked too — memory is all that is left.
  }
  return false;
}

function writeSeen(key: string) {
  memory.add(key);
  let stored = false;
  try {
    window.localStorage.setItem(key, "1");
    stored = true;
  } catch {
    // Not fatal — try the session store instead.
  }
  if (!stored) {
    try {
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Memory still covers the rest of this page's life.
    }
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Another tab marking it seen counts here too.
  const onStorage = () => fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * `[seen, markSeen]` for `key`. A null key reads as already seen — there is
 * nothing to show.
 */
export function useSeenOnce(key: string | null): [boolean, () => void] {
  const seen = useSyncExternalStore(
    subscribe,
    () => (key ? readSeen(key) : true),
    () => true,
  );
  const markSeen = useCallback(() => {
    if (key) writeSeen(key);
  }, [key]);
  return [seen, markSeen];
}

/**
 * The key the pop-up's SECOND step is remembered under (ADR 0084), one per
 * phase: someone who saw "payments close at noon" must see "reservations are
 * open" once the phase changes, and nothing else re-shows it.
 */
export function salesNoticeSeenKey(phase: string): string {
  return `devfest:sales-notice-seen:${phase}`;
}

/** The localStorage key the terms pop-up is remembered under. */
export function termsSeenKey(version: string): string {
  return `devfest:terms-seen:${version}`;
}

/** The pop-up's "our agenda is live" step: shown once, whatever the phase. */
export const AGENDA_SEEN_KEY = "devfest:agenda-live-seen:2026";

/** The pop-up's "welcome our new partners" step: shown once (ADR 0085). */
export const PARTNERS_SEEN_KEY = "devfest:partners-welcome-seen:2026";

/** The pop-up's "keep the agenda on your phone" step: shown once (ADR 0088). Bumped on 2026-11-20 so everyone sees it again with the announcement. */
export const OFFLINE_SEEN_KEY = "devfest:offline-agenda-seen:2026-11-20";

/** The pop-up's "vote for your favourite pitches" step, after the event (ADR 0099). */
export const VOTE_SEEN_KEY = "devfest:pitch-vote-seen:2026";

/** The volunteers' welcome pop-up: shown once per browser (ADR 0090). */
export const VOLUNTEER_WELCOME_KEY = "devfest:volunteer-welcome:2026";
