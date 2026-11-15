"use client";

import {
  Button,
  type ButtonTone,
  type ButtonVariant,
} from "@/components/ui/Button";
import { useBeforeInstant } from "@/lib/use-before-instant";

/**
 * A "get a ticket" button that knows about the sales cutoff (ADR 0072).
 *
 * Before the cutoff it is the ordinary link to `/tickets`. After it, it is
 * never a dead link: `closed="disabled"` keeps the slot as a disabled button
 * that SAYS sales are closed (the hero, where an empty slot would unbalance
 * the cluster); `closed="hide"` removes it where another call to action
 * already sits beside it (the community band, the footer).
 *
 * The flip happens on the client at the minute (`useBeforeInstant`), because
 * the pages that carry this are static; `salesOpenAtRender` is what the
 * server saw, used for hydration.
 */
export function TicketCta({
  salesCloseAt,
  salesOpenAtRender,
  label,
  closedLabel,
  closed,
  tone = "primary",
  variant = "primary",
  size = "lg",
}: {
  salesCloseAt: string | null;
  salesOpenAtRender: boolean;
  label: string;
  closedLabel?: string;
  closed: "disabled" | "hide";
  tone?: ButtonTone;
  variant?: ButtonVariant;
  size?: "lg" | "md";
}) {
  const open = useBeforeInstant(salesCloseAt, salesOpenAtRender);

  if (open) {
    return (
      <Button tone={tone} variant={variant} href="/tickets" size={size}>
        {label}
      </Button>
    );
  }
  if (closed === "hide") return null;
  return (
    <Button tone={tone} variant={variant} size={size} disabled>
      {closedLabel ?? label}
    </Button>
  );
}
