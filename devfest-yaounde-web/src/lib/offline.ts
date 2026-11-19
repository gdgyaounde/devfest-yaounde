/**
 * Saving the agenda for offline (ADR 0088): the page's side of the
 * conversation with `public/sw.js`.
 *
 * The worker does the downloading (it alone may write to the offline cache);
 * this asks it to, relays its progress, and remembers when it last succeeded
 * so the site can top it up quietly now and then.
 */

export type SaveResult = {
  ok: boolean;
  pages: number;
  assets: number;
  /** Why it could not even start (no service worker here, or it never woke). */
  reason?: "unsupported" | "timeout";
};

const SAVED_KEY = "devfest:offline-saved:";
/** How long before the quiet top-up runs again. */
export const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

export function offlineSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export function readSavedAt(locale: string): number | null {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY + locale);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeSavedAt(locale: string) {
  try {
    window.localStorage.setItem(SAVED_KEY + locale, String(Date.now()));
  } catch {
    // Private mode: it still works this session, it just is not remembered.
  }
}

/** Wait for the worker, but never forever (it does not exist in `next dev`). */
async function activeWorker(ms: number): Promise<ServiceWorker | null> {
  if (!offlineSupported()) return null;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
  return registration?.active ?? null;
}

/**
 * Download the four offline pages of `locale` — and what they need — now.
 * Resolves with what was saved; never rejects.
 */
export async function saveAgendaOffline(
  locale: string,
  onProgress?: (done: number, total: number) => void,
): Promise<SaveResult> {
  if (!offlineSupported()) {
    return { ok: false, pages: 0, assets: 0, reason: "unsupported" };
  }
  const worker = await activeWorker(8000);
  if (!worker) return { ok: false, pages: 0, assets: 0, reason: "timeout" };

  return new Promise<SaveResult>((resolve) => {
    const channel = new MessageChannel();
    const giveUp = window.setTimeout(
      () => resolve({ ok: false, pages: 0, assets: 0, reason: "timeout" }),
      60_000,
    );
    channel.port1.onmessage = (event: MessageEvent) => {
      const message = event.data as {
        type: string;
        ok?: boolean;
        pages?: number;
        assets?: number;
        done?: number;
        total?: number;
      };
      if (message.type === "progress") {
        onProgress?.(message.done ?? 0, message.total ?? 0);
      } else if (message.type === "done") {
        window.clearTimeout(giveUp);
        if (message.ok) writeSavedAt(locale);
        resolve({
          ok: Boolean(message.ok),
          pages: message.pages ?? 0,
          assets: message.assets ?? 0,
        });
      }
    };
    worker.postMessage({ type: "precache", locale }, [channel.port2]);
  });
}
