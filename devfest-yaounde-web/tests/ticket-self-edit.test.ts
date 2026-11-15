/**
 * Ticket self-edit (ADR 0075): ownership, the cutoff boundary, what may be
 * changed, the apparel totals organisers order from, and the receipt line.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderTicketReceipt } from "@/lib/email/templates";
import type { PaymentIntentRow } from "@/lib/payments/intents";
import { apparelTotals } from "@/lib/tickets/apparel-totals";
import {
  decideTicketEdit,
  isTicketId,
  ownedTicket,
  refundReferencesFor,
  ticketEditSchema,
  ticketLock,
} from "@/lib/tickets/self-edit";

const CUTOFF = "2026-11-18T23:59:00+01:00";
const settings = { ticketing: { editsCloseAt: CUTOFF } };
const before = new Date("2026-11-18T23:58:59+01:00");
const at = new Date("2026-11-18T23:59:00+01:00");
const open = { checked_in_at: null };

function decide(over: Partial<Parameters<typeof decideTicketEdit>[0]> = {}) {
  return decideTicketEdit({
    now: before,
    settings,
    ticket: open,
    tierIncludesApparel: true,
    hasBlockingRefund: false,
    edit: { attendeeName: "Ama Nkeng" },
    ...over,
  });
}

describe("ownership", () => {
  const ticket = { id: "t1", user_id: "alice" };

  it("lets the holder through", () => {
    assert.deepEqual(ownedTicket(ticket, "alice"), { ok: true, ticket });
  });

  it("gives anybody else a 404, not a 403", () => {
    // An organiser can READ every ticket through RLS; that must not make it
    // editable by them, and the answer must not confirm it exists.
    assert.deepEqual(ownedTicket(ticket, "bob"), {
      ok: false,
      code: "not_found",
      status: 404,
    });
    assert.equal(ownedTicket(null, "bob").ok, false);
    assert.equal((ownedTicket(null, "bob") as { status: number }).status, 404);
  });

  it("treats a malformed id as not found before any query", () => {
    assert.equal(isTicketId("1; drop table tickets"), false);
    assert.equal(isTicketId("3f2b9a1c-7d4e-4a8b-9c0d-1e2f3a4b5c6d"), true);
  });
});

describe("the body is strict", () => {
  it("accepts a name, a size, or both", () => {
    assert.equal(
      ticketEditSchema.safeParse({ attendeeName: "Ama" }).success,
      true,
    );
    assert.equal(
      ticketEditSchema.safeParse({ apparelSize: "XL" }).success,
      true,
    );
    assert.equal(
      ticketEditSchema.safeParse({ attendeeName: "Ama", apparelSize: "S" })
        .success,
      true,
    );
  });

  it("rejects unknown keys — email, tier, badge code, money", () => {
    for (const extra of [
      { attendeeEmail: "x@y.cm" },
      { tierId: "mythos" },
      { badgeCode: "AAAA" },
      { priceXAF: 1 },
    ]) {
      assert.equal(
        ticketEditSchema.safeParse({ attendeeName: "Ama", ...extra }).success,
        false,
        JSON.stringify(extra),
      );
    }
  });

  it("rejects an empty body, a too-short name, control characters, odd sizes", () => {
    assert.equal(ticketEditSchema.safeParse({}).success, false);
    assert.equal(
      ticketEditSchema.safeParse({ attendeeName: "A" }).success,
      false,
    );
    assert.equal(
      ticketEditSchema.safeParse({ attendeeName: "Ama\u0000Nkeng" }).success,
      false,
    );
    assert.equal(
      ticketEditSchema.safeParse({ apparelSize: "XXXL" }).success,
      false,
    );
  });
});

describe("the cutoff boundary", () => {
  it("allows an edit at 23:58:59 Yaoundé time", () => {
    assert.equal(decide().ok, true);
  });

  it("refuses from 23:59:00, whatever the server's timezone", () => {
    assert.deepEqual(decide({ now: at }), {
      ok: false,
      code: "edits_closed",
      status: 409,
    });
    assert.equal(decide({ now: new Date("2026-11-18T22:59:00Z") }).ok, false);
  });
});

describe("the other locks", () => {
  it("refuses a ticket already checked in", () => {
    const r = decide({ ticket: { checked_in_at: "2026-11-21T09:00:00Z" } });
    assert.deepEqual(r, { ok: false, code: "checked_in", status: 409 });
  });

  it("refuses a ticket with an open or granted refund request", () => {
    const r = decide({ hasBlockingRefund: true });
    assert.deepEqual(r, { ok: false, code: "refund_pending", status: 409 });
  });

  it("reports the lock the account screen shows", () => {
    assert.equal(
      ticketLock({
        now: before,
        settings,
        checkedInAt: null,
        hasBlockingRefund: false,
      }),
      null,
    );
    assert.equal(
      ticketLock({
        now: at,
        settings,
        checkedInAt: null,
        hasBlockingRefund: false,
      }),
      "edits_closed",
    );
  });
});

describe("what gets written", () => {
  it("rejects a size on a tier without apparel", () => {
    const r = decide({
      tierIncludesApparel: false,
      edit: { apparelSize: "M" },
    });
    assert.deepEqual(r, {
      ok: false,
      code: "apparel_not_included",
      status: 400,
    });
  });

  it("still allows a name change on a tier without apparel", () => {
    const r = decide({ tierIncludesApparel: false });
    assert.deepEqual(r, { ok: true, update: { attendee_name: "Ama Nkeng" } });
  });

  it("writes only the columns that were sent", () => {
    assert.deepEqual(decide({ edit: { apparelSize: "L" } }), {
      ok: true,
      update: { apparel_size: "L" },
    });
  });
});

describe("refund matching", () => {
  it("matches every identifier a request might quote", () => {
    assert.deepEqual(
      refundReferencesFor({
        id: "t1",
        badge_code: "ABCD",
        deposit_id: "dep-1",
      }),
      ["t1", "ABCD", "dep-1"],
    );
  });
});

describe("apparel totals", () => {
  const rows = [
    { tier_id: "sonnet", apparel_size: "M" },
    { tier_id: "sonnet", apparel_size: "m" },
    { tier_id: "sonnet", apparel_size: null },
    { tier_id: "mythos", apparel_size: "XL" },
    { tier_id: "haikyu", apparel_size: "L" },
    { tier_id: "opus", apparel_size: "3XL" },
  ];
  const totals = apparelTotals(rows, ["sonnet", "opus", "mythos"]);

  it("counts per tier and overall, normalising case", () => {
    const sonnet = totals.tiers.find((t) => t.tierId === "sonnet")!;
    assert.equal(sonnet.counts.M, 2);
    assert.equal(sonnet.missing, 1);
    assert.equal(sonnet.total, 3);
    assert.equal(totals.totals.M, 2);
    assert.equal(totals.totals.XL, 1);
  });

  it("ignores non-apparel tiers and keeps unknown sizes visible", () => {
    assert.equal(totals.totals.L, undefined);
    assert.ok(totals.sizes.includes("3XL"));
    assert.equal(totals.missing, 1);
  });
});

describe("the receipt mentions self-edit while it is open", () => {
  const intent = {
    deposit_id: "dep-1",
    locale: "en",
    kind: "tickets",
    currency: "XAF",
    line_items: [],
    charged_amount: 2050,
    net_amount: 2000,
    discount_amount: 0,
    discount_code: null,
    contact: {},
  } as unknown as PaymentIntentRow;
  const tickets = [
    { tierId: "sonnet", attendeeName: "Ama", badgeCode: "ABCD" },
  ] as Parameters<typeof renderTicketReceipt>[1];

  it("adds the line and the account link", () => {
    const email = renderTicketReceipt(intent, tickets, ["2026-11-21"], {
      date: "Wednesday 18 November",
      time: "23:59",
    });
    assert.match(
      email.text,
      /T-shirt size\? You can do it from your account until Wednesday 18 November at 23:59/,
    );
    assert.match(email.html, /until Wednesday 18 November at 23:59/);
    assert.match(email.text, /\/en\/account/);
  });

  it("leaves it out once edits are closed", () => {
    const email = renderTicketReceipt(intent, tickets, ["2026-11-21"], null);
    assert.doesNotMatch(email.text, /T-shirt size\?/);
  });
});
