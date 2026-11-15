/**
 * Ticket lookups shared by the day-of staff routes (ADR 0079): door
 * check-in, meal/swag hand-out and the name search.
 *
 * Service-role reads, so every caller must have passed `currentStaff()`
 * first. They select only the columns a station shows — never the attendee's
 * email or anything from the payment.
 */
import "server-only";
import { z } from "zod";
import {
  normaliseBadgeCode,
  refundStanding,
  type RefundStanding,
} from "@/lib/tickets/check-in";
import { refundReferencesFor } from "@/lib/tickets/self-edit";
import { createAdminSupabase } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminSupabase>;

/*
 * Deliberately WITHOUT the perk columns from migration 0032: the door must
 * keep working if the code is live before that migration is applied. The
 * perk RPC reads and writes those columns itself.
 */
export const STAFF_TICKET_COLUMNS =
  "id, badge_code, deposit_id, attendee_name, tier_id, apparel_size, checked_in_at";

export interface StaffTicketRow {
  id: string;
  badge_code: string;
  deposit_id: string;
  attendee_name: string;
  tier_id: string;
  apparel_size: string | null;
  checked_in_at: string | null;
}

/**
 * Which ticket a station means: a scanned/typed badge code, or a ticket id
 * picked from a name search. Exactly one. The badge code is normalised the
 * way the screen normalises it.
 */
export const ticketSelectorSchema = z.union([
  z
    .object({
      badgeCode: z
        .string()
        .max(40)
        .transform((value, ctx) => {
          const code = normaliseBadgeCode(value);
          if (!code) {
            ctx.addIssue({ code: "custom", message: "invalid badge code" });
            return z.NEVER;
          }
          return code;
        }),
    })
    .strict(),
  z.object({ ticketId: z.string().uuid() }).strict(),
]);

export type TicketSelector = z.infer<typeof ticketSelectorSchema>;

/** The ticket, `null` when there is none, or `"error"` on a failed read. */
export async function findTicket(
  supabase: Admin,
  selector: TicketSelector,
): Promise<StaffTicketRow | null | "error"> {
  const query = supabase.from("tickets").select(STAFF_TICKET_COLUMNS);
  const { data, error } = await (
    "badgeCode" in selector
      ? query.eq("badge_code", selector.badgeCode)
      : query.eq("id", selector.ticketId)
  ).maybeSingle();
  if (error) {
    console.error("[staff] ticket lookup failed", error.message);
    return "error";
  }
  return (data as StaffTicketRow | null) ?? null;
}

/**
 * The refund standing of one ticket (ADR 0078), or null.
 *
 * FAILS OPEN at the door (a hiccup drops a warning, never the queue) — the
 * perk route decides for itself what a failure means, via `strict`.
 */
export async function refundStandingFor(
  supabase: Admin,
  ticket: Pick<StaffTicketRow, "id" | "badge_code" | "deposit_id">,
  { strict = false }: { strict?: boolean } = {},
): Promise<RefundStanding | null | "error"> {
  const references = refundReferencesFor(ticket).flatMap((r) => [
    r,
    r.toUpperCase(),
    r.toLowerCase(),
  ]);
  const { data, error } = await supabase
    .from("refund_requests")
    .select("status")
    .eq("kind", "tickets")
    .in("reference", [...new Set(references)]);
  if (error) {
    console.error("[staff] refund lookup failed", error.message);
    return strict ? "error" : null;
  }
  return refundStanding((data ?? []).map((r) => r.status));
}
