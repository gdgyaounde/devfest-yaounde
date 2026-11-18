"use client";

import { Package } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useSalesPhase } from "@/components/global/SalesPhaseProvider";

/**
 * What to know before ordering from the shop (ADR 0072, 0084).
 *
 *   selling   — "items ordered now may not be ready by event day" (the
 *               server-resolved text, or nothing once the event is over);
 *   reserving — nothing is paid on the site any more: items are RESERVED and
 *               paid in cash when collected at the venue;
 *   door      — reservations are over: it is cash at the venue.
 *
 * Shown on the listing, the product page and the bag/reservation page.
 */
export function ShopLateNotice({
  text,
  className = "",
}: {
  /** The selling-phase text (resolved with the event's date), or null. */
  text: string | null;
  className?: string;
}) {
  const t = useTranslations("reservations");
  const phase = useSalesPhase();
  const message =
    phase === "selling"
      ? text
      : phase === "reserving"
        ? t("shopReserving")
        : t("shopDoor");
  if (!message) return null;
  return (
    <p
      role="note"
      className={`flex max-w-3xl items-start gap-3 rounded-lg border-2 border-black02 bg-offwhite px-5 py-4 text-body-m font-bold text-black02 ${className}`}
    >
      <Package
        size={24}
        weight="duotone"
        aria-hidden
        className="mt-0.5 shrink-0"
      />
      <span>{message}</span>
    </p>
  );
}
