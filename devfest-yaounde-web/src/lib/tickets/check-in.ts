/**
 * Door check-in rules, shared by the scanner screen and `POST /api/check-in`
 * (ADR 0078).
 *
 * Pure on purpose — no database, no clock — so the parts that decide who
 * gets in are covered by unit tests rather than by somebody at the door.
 */

/**
 * The badge-code shape, exactly as `badge-code.ts` mints it: `DFY-` and two
 * groups of five Crockford base32 characters (no I, L, O or U).
 */
export const BADGE_CODE_RE =
  /^DFY-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

/**
 * Turn whatever was scanned or typed into a badge code, or `null`.
 *
 * Forgiving where a human is likely to slip, and nowhere else:
 *   - case, spaces and missing/extra dashes are ignored
 *     ("dfy abcde 12345", "DFYABCDE12345")
 *   - the characters Crockford base32 leaves out are read as the ones they
 *     look like: O → 0, I and L → 1 — what someone squinting at a cracked
 *     screen will type
 *
 * Anything that is still not the right length after that is rejected here,
 * before it costs a request (and a rate-limit slot) to find out.
 */
export function normaliseBadgeCode(input: string): string | null {
  const compact = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/^DFY/, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (compact.length !== 10) return null;
  const code = `DFY-${compact.slice(0, 5)}-${compact.slice(5)}`;
  return BADGE_CODE_RE.test(code) ? code : null;
}

/** `refund_requests.status` values (migration 0025). */
export type RefundStatus = "requested" | "in_progress" | "resolved" | "denied";

/** What a refund on file means at the door. */
export type RefundStanding = "refunded" | "pending";

/**
 * Fold a ticket's refund requests into one standing, or `null` for none.
 *
 *   - `refunded` — the money went back (`resolved`). Entry is NOT refused:
 *     a free pass gets anyone in (ADR 0074), so a refunded ticket is simply
 *     a free pass now. What it no longer carries are the paid perks — the
 *     meal and the swag — and that is what the volunteer is told.
 *   - `pending`  — a request is still open. They paid and have not been
 *     paid back, so they get everything — but the scan says so, so whoever
 *     handles refunds closes the request instead of paying out for a pass
 *     that was used.
 *   - `null`     — nothing on file, or only denied requests.
 *
 * `resolved` wins over an open request: if any request on this ticket was
 * paid out, it was paid out. A reference can be the order's deposit id, so a
 * whole-order refund flags every ticket on it — which is what it means.
 */
export function refundStanding(
  statuses: readonly string[],
): RefundStanding | null {
  if (statuses.includes("resolved")) return "refunded";
  if (statuses.some((s) => s === "requested" || s === "in_progress")) {
    return "pending";
  }
  return null;
}

import type { Pack } from "@/lib/staff/pack";

/** Every answer the scanner can get back from `POST /api/check-in`. */
export type CheckInResult =
  | {
      status: "checked_in";
      attendeeName: string;
      tierId: string;
      refund?: RefundStanding;
      /** What their pack offers (ADR 0091). */
      pack?: Pack;
    }
  | {
      status: "already_checked_in";
      attendeeName: string;
      tierId: string;
      checkedInAt: string;
      refund?: RefundStanding;
      pack?: Pack;
    }
  | { status: "not_found" };
