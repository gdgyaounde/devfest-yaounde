"use client";

import { useEffect } from "react";
import { BACKUP_STALE_MS, readBackup, syncBackup } from "@/lib/backup-store";

/**
 * Keeps the offline backup list fresh without anyone remembering to (ADR
 * 0090): on the volunteer hub, if the phone's copy is missing or older than
 * twenty minutes and there is a connection, quietly fetch it.
 */
export function BackupSync() {
  useEffect(() => {
    const saved = readBackup();
    if (saved && Date.now() - saved.savedAt < BACKUP_STALE_MS) return;
    void syncBackup();
  }, []);
  return null;
}
