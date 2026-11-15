/**
 * The one-day edition and the ticketing cutoff (ADRs 0071, 0072).
 *
 * Pure logic only: the cutoff helpers checkout, the tickets page, the banner
 * and the admin all call; the checkout guard; the cron window; the banner's
 * per-message dismissal key; and the shape of the 2026 edition's dates.
 *
 * Run with `npm test`.
 */
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { announcementDismissKey } from "@/lib/announcement-key";
import { EVENT_DATES } from "@/lib/calendar";
import { settingsSchema } from "@/lib/content/schemas";
import {
  EVENT,
  eventJsonLd,
  formatCutoff,
  formatEventDates,
  ticketEditsOpen,
  ticketSalesOpen,
  withinSalesCloseRevalidateWindow,
} from "@/lib/event";
import { assertTicketSalesOpen } from "@/lib/payments/catalog";
import { CheckoutError } from "@/lib/payments/errors";
import { quoteCart, quoteTierCounts } from "@/lib/payments/pricing";
import {
  TICKET_EDITS_CLOSE_AT,
  TICKET_SALES_CLOSE_AT,
} from "@/lib/site-config";

const CUTOFF = "2026-11-18T23:59:00+01:00";
/** 23:59 in Yaoundé (UTC+1, no DST) is 22:59 UTC. */
const CUTOFF_MS = Date.UTC(2026, 10, 18, 22, 59, 0);

const settings = (
  salesCloseAt: string | null,
  editsCloseAt = salesCloseAt,
) => ({
  ticketing: { salesCloseAt, editsCloseAt },
});

describe("the 2026 edition is one day (ADR 0071)", () => {
  it("has exactly one date, Saturday 21 November", () => {
    assert.deepEqual([...EVENT_DATES], ["2026-11-21"]);
    assert.equal(EVENT.days, 1);
  });

  it("reads as one date, not a range", () => {
    assert.equal(formatEventDates("en", EVENT_DATES), "21 November 2026");
    assert.equal(formatEventDates("fr", EVENT_DATES), "21 novembre 2026");
  });

  it("publishes a plain start and end — no subEvent for a single day", () => {
    const data = eventJsonLd("en", "x", EVENT_DATES) as Record<string, unknown>;
    assert.equal(data.startDate, "2026-11-21T09:00:00");
    assert.equal(data.endDate, "2026-11-21T18:00:00");
    assert.equal("subEvent" in data, false);
  });
});

describe("the repo default cutoff", () => {
  it("is Wednesday 18 November 2026, 23:59 Yaoundé time, for both", () => {
    assert.equal(Date.parse(TICKET_SALES_CLOSE_AT), CUTOFF_MS);
    assert.equal(Date.parse(TICKET_EDITS_CLOSE_AT), CUTOFF_MS);
  });
});

describe("ticketSalesOpen (ADR 0072)", () => {
  it("is open with time to spare", () => {
    assert.equal(
      ticketSalesOpen(new Date("2026-11-15T12:00:00+01:00"), settings(CUTOFF)),
      true,
    );
  });

  it("is open through the last second of 23:58", () => {
    assert.equal(
      ticketSalesOpen(new Date(CUTOFF_MS - 1), settings(CUTOFF)),
      true,
    );
    assert.equal(
      ticketSalesOpen(new Date("2026-11-18T23:58:59+01:00"), settings(CUTOFF)),
      true,
    );
  });

  it("closes AT 23:59:00 Yaoundé time, and stays closed", () => {
    assert.equal(ticketSalesOpen(new Date(CUTOFF_MS), settings(CUTOFF)), false);
    assert.equal(
      ticketSalesOpen(new Date("2026-11-21T10:00:00+01:00"), settings(CUTOFF)),
      false,
    );
  });

  it("reads the instant's own offset, not the server's timezone", () => {
    // 22:59 UTC and 23:59 WAT are the same instant; 23:59 UTC is an hour
    // later. A server on UTC must not keep selling for that extra hour.
    assert.equal(
      ticketSalesOpen(new Date("2026-11-18T22:59:00Z"), settings(CUTOFF)),
      false,
    );
    assert.equal(
      ticketSalesOpen(new Date("2026-11-18T22:58:59Z"), settings(CUTOFF)),
      true,
    );
    // The same cutoff written in UTC behaves identically.
    assert.equal(
      ticketSalesOpen(
        new Date(CUTOFF_MS),
        settings("2026-11-18T22:59:00.000Z"),
      ),
      false,
    );
  });

  it("treats an empty, null or unparseable cutoff as no cutoff", () => {
    const late = new Date("2030-01-01T00:00:00Z");
    assert.equal(ticketSalesOpen(late, settings("")), true);
    assert.equal(ticketSalesOpen(late, settings(null)), true);
    assert.equal(ticketSalesOpen(late, settings("not a date")), true);
  });
});

describe("ticketEditsOpen (ADR 0072)", () => {
  it("has the same boundary as sales", () => {
    assert.equal(
      ticketEditsOpen(new Date(CUTOFF_MS - 1), settings(CUTOFF)),
      true,
    );
    assert.equal(ticketEditsOpen(new Date(CUTOFF_MS), settings(CUTOFF)), false);
  });

  it("reads its own instant, independently of sales", () => {
    const s = settings(CUTOFF, "2026-11-19T12:00:00+01:00");
    const between = new Date("2026-11-19T08:00:00+01:00");
    assert.equal(ticketSalesOpen(between, s), false);
    assert.equal(ticketEditsOpen(between, s), true);
  });
});

describe("checkout refuses tickets after the cutoff", () => {
  it("lets a purchase through before it", () => {
    assert.doesNotThrow(() =>
      assertTicketSalesOpen(new Date(CUTOFF_MS - 1), settings(CUTOFF)),
    );
  });

  it("refuses with a stable code and 409 from the cutoff on", () => {
    assert.throws(
      () => assertTicketSalesOpen(new Date(CUTOFF_MS), settings(CUTOFF)),
      (err: unknown) =>
        err instanceof CheckoutError &&
        err.code === "ticket_sales_closed" &&
        err.status === 409,
    );
  });
});

describe("the cron's rebuild window after sales close", () => {
  it("opens at the cutoff and lasts one day", () => {
    const s = settings(CUTOFF);
    assert.equal(
      withinSalesCloseRevalidateWindow(new Date(CUTOFF_MS - 1), s),
      false,
    );
    assert.equal(
      withinSalesCloseRevalidateWindow(new Date(CUTOFF_MS), s),
      true,
    );
    assert.equal(
      withinSalesCloseRevalidateWindow(new Date(CUTOFF_MS + 86_400_000 - 1), s),
      true,
    );
    assert.equal(
      withinSalesCloseRevalidateWindow(new Date(CUTOFF_MS + 86_400_000), s),
      false,
    );
  });

  it("never fires without a cutoff", () => {
    assert.equal(
      withinSalesCloseRevalidateWindow(new Date(CUTOFF_MS), settings(null)),
      false,
    );
  });
});

describe("formatCutoff — the deadline as people read it", () => {
  it("prints Yaoundé wall time in both languages", () => {
    assert.deepEqual(formatCutoff("fr", CUTOFF), {
      date: "mercredi 18 novembre",
      short: "mer. 18 nov.",
      time: "23h59",
    });
    assert.deepEqual(formatCutoff("en", CUTOFF), {
      date: "Wednesday 18 November",
      short: "Wed 18 Nov",
      time: "23:59",
    });
  });

  it("does not depend on the process timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      assert.equal(formatCutoff("en", CUTOFF)?.time, "23:59");
      assert.equal(formatCutoff("en", CUTOFF)?.date, "Wednesday 18 November");
      process.env.TZ = "Asia/Tokyo";
      assert.equal(formatCutoff("fr", CUTOFF)?.time, "23h59");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("returns null rather than 'Invalid Date'", () => {
    assert.equal(formatCutoff("en", ""), null);
    assert.equal(formatCutoff("en", null), null);
    assert.equal(formatCutoff("en", "nope"), null);
  });
});

describe("the settings schema accepts the ticketing group", () => {
  it("takes ISO instants, empty and null", () => {
    assert.equal(
      settingsSchema.safeParse({
        ticketing: { salesCloseAt: CUTOFF, editsCloseAt: "" },
      }).success,
      true,
    );
    assert.equal(
      settingsSchema.safeParse({
        ticketing: { salesCloseAt: null, editsCloseAt: null },
      }).success,
      true,
    );
  });

  it("refuses something that is not a date", () => {
    assert.equal(
      settingsSchema.safeParse({ ticketing: { salesCloseAt: "wednesday" } })
        .success,
      false,
    );
  });
});

describe("banner dismissal is keyed by the message (ADR 0072)", () => {
  it("is stable for the same text", () => {
    assert.equal(
      announcementDismissKey("Ticket sales close Wednesday"),
      announcementDismissKey("Ticket sales close Wednesday"),
    );
  });

  it("differs for a new message, so it shows again", () => {
    assert.notEqual(
      announcementDismissKey("🎟️ Early bird tickets end soon"),
      announcementDismissKey(
        "Ticket sales close Wednesday 18 November at 23:59",
      ),
    );
  });

  it("stays a namespaced sessionStorage key", () => {
    assert.match(
      announcementDismissKey("anything"),
      /^devfest-announcement-dismissed:[0-9a-z]+$/,
    );
  });
});

/*
 * The real pricing path, end to end but without a database: no Supabase env
 * in the test run, so tiers, products and settings all come from the repo —
 * which means the cutoff is the repo default, Wed 18 Nov 23:59 Yaoundé.
 * The clock is mocked on both sides of it.
 */
describe("pricing enforces the cutoff on the server (tickets only)", () => {
  const at = (iso: string) => {
    mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });
  };

  it("prices a ticket before the cutoff", async (t) => {
    t.after(() => mock.timers.reset());
    at("2026-11-18T23:58:59+01:00");
    const quote = await quoteTierCounts([{ tierId: "sonnet", quantity: 1 }]);
    assert.ok(quote.charged > 0);
  });

  it("refuses a ticket from 23:59 on — preview and checkout share this path", async (t) => {
    t.after(() => mock.timers.reset());
    at("2026-11-18T23:59:00+01:00");
    await assert.rejects(
      quoteTierCounts([{ tierId: "sonnet", quantity: 1 }]),
      (err: unknown) =>
        err instanceof CheckoutError && err.code === "ticket_sales_closed",
    );
  });

  it("keeps the shop open after the cutoff", async (t) => {
    t.after(() => mock.timers.reset());
    at("2026-11-19T10:00:00+01:00");
    const quote = await quoteCart([{ productId: "sticker-pack", quantity: 1 }]);
    assert.ok(quote.charged > 0);
  });
});
