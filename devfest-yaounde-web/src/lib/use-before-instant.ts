"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the clock is still BEFORE an instant — and flips, live, the moment
 * it is not (ADR 0072).
 *
 * WHY THIS AND NOT A SERVER CHECK ALONE. The public pages are statically
 * prerendered and only rebuilt on an explicit revalidation, so a page built
 * at 18:00 still says "sales open" at 00:05 until something rebuilds it. The
 * cron sweep does rebuild them shortly after the cutoff, and checkout refuses
 * on the server regardless — this is the third layer, so the button a person
 * is looking at changes at the minute the banner promised, not up to five
 * minutes later.
 *
 * `serverValue` is what the server computed when it rendered the HTML. React
 * uses it during hydration (so there is no mismatch whatever time the page
 * was built), then switches to the live clock. A boolean snapshot is stable
 * by value, so no caching is needed to avoid a render loop.
 *
 * Empty / unparseable `instant` means "no cutoff": always before.
 */
export function useBeforeInstant(
  instant: string | null | undefined,
  serverValue: boolean,
) {
  const end = parse(instant);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (end === null) return () => {};
      let id: number | undefined;
      const arm = () => {
        const left = end - Date.now();
        if (left <= 0) {
          onChange();
          return;
        }
        // setTimeout overflows above ~24.8 days and fires immediately, so a
        // far-off cutoff re-arms in steps rather than firing at once.
        id = window.setTimeout(arm, Math.min(left + 50, 2 ** 31 - 1));
      };
      arm();
      // A laptop that sleeps through the cutoff wakes with a timer that has
      // not fired yet; re-check whenever the tab comes back.
      const onVisible = () => {
        if (document.visibilityState === "visible") onChange();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        window.clearTimeout(id);
        document.removeEventListener("visibilitychange", onVisible);
      };
    },
    [end],
  );

  return useSyncExternalStore(
    subscribe,
    () => end === null || Date.now() < end,
    () => serverValue,
  );
}

function parse(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
