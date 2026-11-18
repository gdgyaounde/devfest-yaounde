"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SalesPhase } from "@/lib/event";
import { feeInclusiveAmount } from "@/lib/payments/fees";
import { useBeforeInstant } from "@/lib/use-before-instant";

/**
 * The end-game phase, live (ADR 0084): `selling` → `reserving` → `door`.
 *
 * The public pages are statically prerendered, so the server's answer goes
 * stale at 12:00 today and again on Friday at 17:00. This provider keeps the
 * server's answer for hydration (so there is no mismatch whatever time the
 * page was built), then follows the clock at the minute — the same
 * `useBeforeInstant` seam the cutoff already used, now read ONCE for the
 * whole site instead of per component.
 *
 * An empty instant means "no cutoff": a cleared `salesCloseAt` keeps selling,
 * a cleared `reservationsCloseAt` keeps reserving — the same reading
 * `salesPhase()` gives.
 */
const PhaseContext = createContext<SalesPhase>("selling");

export function SalesPhaseProvider({
  salesCloseAt,
  reservationsCloseAt,
  initial,
  children,
}: {
  salesCloseAt: string | null;
  reservationsCloseAt: string | null;
  /** What the server computed when it rendered this HTML. */
  initial: SalesPhase;
  children: ReactNode;
}) {
  const selling = useBeforeInstant(salesCloseAt, initial === "selling");
  const reservingOrEarlier = useBeforeInstant(
    reservationsCloseAt,
    initial !== "door",
  );
  const phase: SalesPhase = selling
    ? "selling"
    : reservingOrEarlier
      ? "reserving"
      : "door";
  return (
    <PhaseContext.Provider value={phase}>{children}</PhaseContext.Provider>
  );
}

export function useSalesPhase(): SalesPhase {
  return useContext(PhaseContext);
}

/**
 * The price a visitor should be shown for a listed (base) price (ADR 0084).
 *
 * While payments are online the 1.5 % transaction fee is part of the price
 * (ADR 0068). Once payments close, everything is paid in CASH at the venue,
 * where there is no mobile-money fee — so the same item shows, and is
 * reserved at, its base price. One hook, so no card ever shows one number
 * and a reservation another.
 */
export function useDisplayPrice(): (base: number, venue?: number) => number {
  const phase = useSalesPhase();
  // Online: the base price plus the fee. From the cutoff: the cash price at
  // the venue — its own `venuePriceXAF` if the organisers set one.
  return (base, venue) =>
    phase === "selling" ? feeInclusiveAmount(base) : (venue ?? base);
}
