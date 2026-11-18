"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  type ButtonTone,
  type ButtonVariant,
} from "@/components/ui/Button";
import { useSalesPhase } from "@/components/global/SalesPhaseProvider";

/**
 * The "get a ticket" button, and what it becomes (ADR 0072, 0084).
 *
 *   selling   — the ordinary link to `/tickets`;
 *   reserving — "Reserve your spot", linking to `/reserve` (payments are
 *               closed; nothing is paid on the site any more);
 *   door      — never a dead link: `closed="disabled"` keeps the slot as a
 *               disabled button that says "Pay at the venue" (the hero,
 *               where an empty slot would unbalance the cluster);
 *               `closed="hide"` removes it where another call to action
 *               already sits beside it (the community band, the footer).
 *
 * The phase comes from `SalesPhaseProvider`, which follows the clock at the
 * minute — the pages that carry this are static.
 */
export function TicketCta({
  label,
  reserveLabel,
  closedLabel,
  closed,
  tone = "primary",
  variant = "primary",
  size = "lg",
}: {
  label: string;
  /** Defaults to `reservations.cta`. */
  reserveLabel?: string;
  /** Defaults to `reservations.doorCta`. */
  closedLabel?: string;
  closed: "disabled" | "hide";
  tone?: ButtonTone;
  variant?: ButtonVariant;
  size?: "lg" | "md";
}) {
  const t = useTranslations("reservations");
  const phase = useSalesPhase();

  if (phase === "selling") {
    return (
      <Button tone={tone} variant={variant} href="/tickets" size={size}>
        {label}
      </Button>
    );
  }
  if (phase === "reserving") {
    return (
      <Button tone={tone} variant={variant} href="/reserve" size={size}>
        {reserveLabel ?? t("cta")}
      </Button>
    );
  }
  if (closed === "hide") return null;
  return (
    <Button tone={tone} variant={variant} size={size} disabled>
      {closedLabel ?? t("doorCta")}
    </Button>
  );
}
