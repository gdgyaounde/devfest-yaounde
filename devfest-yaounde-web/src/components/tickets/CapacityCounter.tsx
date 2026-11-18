"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Odometer } from "@/components/ui/Odometer";

/**
 * The public "N tickets remaining" banner (Phase 20 / A6).
 *
 * `total` is the admin-set overall event capacity — independent of any
 * tier's own cap, which checkout enforces separately. Nothing renders when
 * `total` is null: no capacity has been set, so there is nothing honest to
 * show. `remaining` comes from the server, polled on an interval; this
 * component never computes it from tier data itself.
 *
 * The digits roll like a view counter on change — the shared `Odometer`,
 * which the home page stats reuse rather than re-implement.
 * `prefers-reduced-motion` skips the transition entirely, per DESIGN.md §6.5.
 */
const POLL_MS = 60_000;

export function CapacityCounter({
  initial,
}: {
  initial: { total: number | null; remaining: number | null };
}) {
  const t = useTranslations("pages.tickets");
  const locale = useLocale();
  const [state, setState] = useState(initial);

  useEffect(() => {
    if (initial.total == null) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      fetch("/api/tickets/capacity")
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (body: { total: number | null; remaining: number | null } | null) => {
            if (!cancelled && body) setState(body);
          },
        )
        .catch(() => {
          // A stale number beats a broken banner — just skip this tick.
        });
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [initial.total]);

  if (state.total == null || state.remaining == null) return null;

  const digits = Math.max(String(state.total).length, 2);

  return (
    <div className="flex items-center gap-3 rounded-lg border-2 border-black02 bg-pastel px-5 py-3.5">
      <Odometer value={state.remaining} digits={digits} />
      <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
        {t("capacityRemaining", { total: state.total.toLocaleString(locale) })}
      </span>
    </div>
  );
}
