"use client";

import { useEffect } from "react";
import {
  REFRESH_AFTER_MS,
  readSavedAt,
  saveAgendaOffline,
} from "@/lib/offline";

/**
 * Registers `public/sw.js` — the offline Schedule/Speakers/Team/FAQs cache
 * (PHASE22 §F, ADR 0066).
 *
 * No visual output; this only wires the browser up. Skipped outright in
 * development: `next dev`'s own fast refresh already rewrites `/_next/`
 * asset URLs on every save, and a service worker caching an old build's
 * chunk hashes underneath that is a confusing bug to chase, not a feature
 * worth having on a machine that is never offline anyway. Skipped just as
 * hard when the browser has no `serviceWorker` API at all, rather than
 * letting that throw.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then(async () => {
        // Quietly keep the agenda saved for offline (ADR 0088): once a
        // visitor has been here, the four pages are on their device without
        // them having to visit each one. Skipped on data saver, when offline,
        // and while the last save is still fresh.
        const connection = (
          navigator as Navigator & { connection?: { saveData?: boolean } }
        ).connection;
        if (!navigator.onLine || connection?.saveData) return;
        const locale = document.documentElement.lang === "en" ? "en" : "fr";
        const last = readSavedAt(locale);
        if (last !== null && Date.now() - last < REFRESH_AFTER_MS) return;
        const run = () => void saveAgendaOffline(locale);
        const idle = (
          window as Window & {
            requestIdleCallback?: (
              cb: () => void,
              opts?: { timeout: number },
            ) => number;
          }
        ).requestIdleCallback;
        if (idle) idle(run, { timeout: 15_000 });
        else window.setTimeout(run, 4000);
      })
      .catch(() => {
        // A registration failure must never be a page-breaking error — the
        // site works perfectly well without offline support, it just does
        // not have it.
      });
  }, []);

  return null;
}
