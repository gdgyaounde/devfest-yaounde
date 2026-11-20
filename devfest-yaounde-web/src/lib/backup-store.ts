/**
 * The phone's copy of the offline backup list (ADR 0090): fetch it from the
 * server while online, keep it in this browser's storage, drop it the moment
 * it expires or the server says this person no longer has access.
 */
import {
  backupExpired,
  type BackupList,
  type StoredBackup,
} from "@/lib/staff/backup-list";

const KEY = "devfest:backup-list:v1";
/** Top-up when the copy is older than this and we are online. */
export const BACKUP_STALE_MS = 20 * 60 * 1000;

export function readBackup(now: number = Date.now()): StoredBackup | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBackup;
    if (!parsed?.list || !Array.isArray(parsed.list.tickets)) return null;
    if (backupExpired(parsed.list, now)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearBackup(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export type SyncOutcome =
  | { ok: true; stored: StoredBackup }
  | { ok: false; reason: "offline" | "denied" | "limited" | "failed" };

/** Download the roster and keep it. Never throws. */
export async function syncBackup(): Promise<SyncOutcome> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, reason: "offline" };
  }
  try {
    const response = await fetch("/api/staff/backup-list", {
      cache: "no-store",
    });
    if (response.status === 403) {
      // No longer staff: nothing of theirs stays on this phone.
      clearBackup();
      return { ok: false, reason: "denied" };
    }
    if (response.status === 429) return { ok: false, reason: "limited" };
    if (!response.ok) return { ok: false, reason: "failed" };
    const list = (await response.json()) as BackupList;
    const stored: StoredBackup = { list, savedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
    return { ok: true, stored };
  } catch {
    return { ok: false, reason: "offline" };
  }
}
