"use client";

import { useEffect } from "react";

/**
 * Sets the tab title on mount. The volunteer tree declares no metadata
 * title, so a non-staff 404 never carries one (see the admin layout).
 */
export function StaffTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} · DevFest Yaoundé`;
  }, [title]);
  return null;
}
