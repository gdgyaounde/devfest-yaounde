/**
 * Ticket self-edit (ADR 0075): what a holder may change, and when.
 *
 * PURE — no database, no request — so every rule is unit-tested and the
 * route handler is only plumbing: authenticate, load, ask this, write.
 *
 * Editable: the attendee's NAME (it is printed on the identifier) and the
 * APPAREL SIZE (only on a tier that includes apparel). Never the email, the
 * tier, the badge code or anything money-related — the schema is strict, so
 * an unknown key is refused rather than ignored.
 */
import { z } from "zod";
import type { TicketingSettings } from "@/lib/admin/shape";
import { ticketEditsOpen } from "@/lib/event";

export const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
export type ApparelSize = (typeof APPAREL_SIZES)[number];

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Same rules as checkout's attendee name (`payments/schemas.ts`). */
const attendeeName = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((value) => !hasControlCharacters(value), "invalid characters");

/**
 * The body a holder may send. `.strict()`: `{ tierId }`, `{ email }`,
 * `{ badgeCode }` — anything not listed — fails validation outright.
 */
export const ticketEditSchema = z
  .object({
    attendeeName: attendeeName.optional(),
    apparelSize: z.enum(APPAREL_SIZES).optional(),
  })
  .strict()
  .refine(
    (body) => body.attendeeName !== undefined || body.apparelSize !== undefined,
    "nothing to change",
  );

export type TicketEdit = z.infer<typeof ticketEditSchema>;

/** Stable codes; the account screen maps them to copy in both languages. */
export const TICKET_EDIT_ERRORS = {
  UNAUTHENTICATED: "unauthenticated",
  RATE_LIMITED: "rate_limited",
  NOT_FOUND: "not_found",
  INVALID_BODY: "invalid_body",
  EDITS_CLOSED: "edits_closed",
  CHECKED_IN: "checked_in",
  REFUND_PENDING: "refund_pending",
  APPAREL_NOT_INCLUDED: "apparel_not_included",
  SERVER_ERROR: "server_error",
} as const;

export type TicketEditError =
  (typeof TICKET_EDIT_ERRORS)[keyof typeof TICKET_EDIT_ERRORS];

/** Refund statuses that freeze a ticket: anything still open, or granted. */
export const BLOCKING_REFUND_STATUSES = [
  "requested",
  "in_progress",
  "resolved",
] as const;

/** Why a ticket cannot be edited right now, or null when it can. */
export type TicketLock = "edits_closed" | "checked_in" | "refund_pending";

export function ticketLock(input: {
  now: Date;
  settings: { ticketing: Pick<TicketingSettings, "editsCloseAt"> };
  checkedInAt: string | null;
  hasBlockingRefund: boolean;
}): TicketLock | null {
  if (!ticketEditsOpen(input.now, input.settings)) return "edits_closed";
  if (input.checkedInAt) return "checked_in";
  if (input.hasBlockingRefund) return "refund_pending";
  return null;
}

/**
 * The whole decision, in order: is the ticket editable at all, then is this
 * particular change allowed. Returns the exact columns to write.
 */
export function decideTicketEdit(input: {
  now: Date;
  settings: { ticketing: Pick<TicketingSettings, "editsCloseAt"> };
  ticket: { checked_in_at: string | null };
  tierIncludesApparel: boolean;
  hasBlockingRefund: boolean;
  edit: TicketEdit;
}):
  | {
      ok: true;
      update: { attendee_name?: string; apparel_size?: ApparelSize };
    }
  | { ok: false; code: TicketEditError; status: number } {
  const lock = ticketLock({
    now: input.now,
    settings: input.settings,
    checkedInAt: input.ticket.checked_in_at,
    hasBlockingRefund: input.hasBlockingRefund,
  });
  if (lock === "edits_closed") {
    return { ok: false, code: TICKET_EDIT_ERRORS.EDITS_CLOSED, status: 409 };
  }
  if (lock === "checked_in") {
    return { ok: false, code: TICKET_EDIT_ERRORS.CHECKED_IN, status: 409 };
  }
  if (lock === "refund_pending") {
    return { ok: false, code: TICKET_EDIT_ERRORS.REFUND_PENDING, status: 409 };
  }
  if (input.edit.apparelSize !== undefined && !input.tierIncludesApparel) {
    return {
      ok: false,
      code: TICKET_EDIT_ERRORS.APPAREL_NOT_INCLUDED,
      status: 400,
    };
  }
  return {
    ok: true,
    update: {
      ...(input.edit.attendeeName !== undefined
        ? { attendee_name: input.edit.attendeeName }
        : {}),
      ...(input.edit.apparelSize !== undefined
        ? { apparel_size: input.edit.apparelSize }
        : {}),
    },
  };
}

/**
 * Ownership, as the route applies it: a ticket that did not come back, or
 * came back but belongs to someone else, is NOT FOUND (404) — never 403,
 * which would confirm it exists. "Came back but someone else's" is real:
 * RLS lets organisers read every ticket.
 */
export function ownedTicket<T extends { user_id: string }>(
  ticket: T | null | undefined,
  userId: string,
): { ok: true; ticket: T } | { ok: false; code: "not_found"; status: 404 } {
  if (!ticket || ticket.user_id !== userId) {
    return { ok: false, code: TICKET_EDIT_ERRORS.NOT_FOUND, status: 404 };
  }
  return { ok: true, ticket };
}

/** UUID v4-ish shape check, so a junk id is a 404 without a query. */
export function isTicketId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * The `refund_requests.reference` values that point at this ticket. The
 * column is free text (migration 0025 — "a badge code, a deposit id, an
 * order id, or whatever the person gave"), so it is matched against every
 * identifier the ticket has, case-insensitively.
 */
export function refundReferencesFor(ticket: {
  id: string;
  badge_code: string;
  deposit_id: string;
}): string[] {
  return [ticket.id, ticket.badge_code, ticket.deposit_id];
}
