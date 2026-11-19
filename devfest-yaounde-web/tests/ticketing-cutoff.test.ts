/**
 * The one-day edition, the ticketing cutoff and the payments → reservations →
 * cash-at-the-venue phases (ADRs 0071, 0072, 0084).
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
  salesPhase,
  ticketEditsOpen,
  ticketSalesOpen,
  withinSalesCloseRevalidateWindow,
} from "@/lib/event";
import {
  assertPaymentsOpen,
  assertTicketSalesOpen,
} from "@/lib/payments/catalog";
import { CheckoutError } from "@/lib/payments/errors";
import { quoteCart, quoteTierCounts } from "@/lib/payments/pricing";
import {
  RESERVATIONS_CLOSE_AT,
  TICKET_EDITS_CLOSE_AT,
  TICKET_SALES_CLOSE_AT,
} from "@/lib/site-config";

/** Payments close at 12:00 Wednesday (ADR 0084; was 23:59). */
const CUTOFF = "2026-11-18T12:00:00+01:00";
/** 12:00 in Yaoundé (UTC+1, no DST) is 11:00 UTC. */
const CUTOFF_MS = Date.UTC(2026, 10, 18, 11, 0, 0);
/** Edits still close at 23:59 the same day. */
const EDITS_MS = Date.UTC(2026, 10, 18, 22, 59, 0);
/** Reservations close Friday 17:00 (16:00 UTC). */
const RESERVATIONS_MS = Date.UTC(2026, 10, 20, 16, 0, 0);

const settings = (
  salesCloseAt: string | null,
  editsCloseAt = salesCloseAt,
  reservationsCloseAt: string | null = null,
) => ({
  ticketing: { salesCloseAt, editsCloseAt, reservationsCloseAt },
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
    assert.equal(data.startDate, "2026-11-21T08:00:00");
    assert.equal(data.endDate, "2026-11-21T19:00:00");
    assert.equal("subEvent" in data, false);
  });
});

describe("the repo default cutoff", () => {
  it("closes payments Wednesday 18 November 2026 at 12:00 Yaoundé time", () => {
    assert.equal(Date.parse(TICKET_SALES_CLOSE_AT), CUTOFF_MS);
  });

  it("still closes edits at 23:59 the same day", () => {
    assert.equal(Date.parse(TICKET_EDITS_CLOSE_AT), EDITS_MS);
  });

  it("closes reservations Friday 20 November at 17:00", () => {
    assert.equal(Date.parse(RESERVATIONS_CLOSE_AT), RESERVATIONS_MS);
  });
});

describe("salesPhase (ADR 0084)", () => {
  const s = settings(
    TICKET_SALES_CLOSE_AT,
    TICKET_EDITS_CLOSE_AT,
    RESERVATIONS_CLOSE_AT,
  );
  const at = (ms: number) => salesPhase(new Date(ms), s);

  it("sells until the very last second before noon", () => {
    assert.equal(at(CUTOFF_MS - 1), "selling");
  });

  it("reserves from noon on — closed FROM the instant", () => {
    assert.equal(at(CUTOFF_MS), "reserving");
    assert.equal(at(Date.UTC(2026, 10, 19, 9, 0, 0)), "reserving");
    assert.equal(at(RESERVATIONS_MS - 1), "reserving");
  });

  it("is cash at the door from Friday 17:00", () => {
    assert.equal(at(RESERVATIONS_MS), "door");
    assert.equal(at(Date.UTC(2026, 10, 21, 8, 0, 0)), "door");
  });

  it("never shuts a door because a field was cleared", () => {
    const now = new Date(Date.UTC(2026, 10, 25));
    assert.equal(salesPhase(now, settings(null, null, null)), "selling");
    assert.equal(salesPhase(now, settings(CUTOFF, null, null)), "reserving");
  });

  it("rebuilds the site around BOTH switches", () => {
    assert.equal(
      withinSalesCloseRevalidateWindow(new Date(CUTOFF_MS + 60_000), s),
      true,
    );
    assert.equal(
      withinSalesCloseRevalidateWindow(new Date(RESERVATIONS_MS + 60_000), s),
      true,
    );
    assert.equal(
      withinSalesCloseRevalidateWindow(new Date(CUTOFF_MS - 60_000), s),
      false,
    );
  });
});

describe("assertPaymentsOpen (ADR 0084)", () => {
  it("lets a payment through before noon, refuses it from noon", () => {
    assert.doesNotThrow(() =>
      assertPaymentsOpen(new Date(CUTOFF_MS - 1), settings(CUTOFF)),
    );
    assert.throws(
      () => assertPaymentsOpen(new Date(CUTOFF_MS), settings(CUTOFF)),
      (err: unknown) =>
        err instanceof CheckoutError && err.code === "payments_closed",
    );
  });
});

describe("ticketSalesOpen (ADR 0072)", () => {
  it("is open with time to spare", () => {
    assert.equal(
      ticketSalesOpen(new Date("2026-11-15T12:00:00+01:00"), settings(CUTOFF)),
      true,
    );
  });

  it("is open through the last second of 11:59", () => {
    assert.equal(
      ticketSalesOpen(new Date(CUTOFF_MS - 1), settings(CUTOFF)),
      true,
    );
    assert.equal(
      ticketSalesOpen(new Date("2026-11-18T11:59:59+01:00"), settings(CUTOFF)),
      true,
    );
  });

  it("closes AT 12:00:00 Yaoundé time, and stays closed", () => {
    assert.equal(ticketSalesOpen(new Date(CUTOFF_MS), settings(CUTOFF)), false);
    assert.equal(
      ticketSalesOpen(new Date("2026-11-21T10:00:00+01:00"), settings(CUTOFF)),
      false,
    );
  });

  it("reads the instant's own offset, not the server's timezone", () => {
    // 11:00 UTC and 12:00 WAT are the same instant; 12:00 UTC is an hour
    // later. A server on UTC must not keep selling for that extra hour.
    assert.equal(
      ticketSalesOpen(new Date("2026-11-18T11:00:00Z"), settings(CUTOFF)),
      false,
    );
    assert.equal(
      ticketSalesOpen(new Date("2026-11-18T10:59:59Z"), settings(CUTOFF)),
      true,
    );
    // The same cutoff written in UTC behaves identically.
    assert.equal(
      ticketSalesOpen(
        new Date(CUTOFF_MS),
        settings("2026-11-18T11:00:00.000Z"),
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
      time: "12h00",
    });
    assert.deepEqual(formatCutoff("en", CUTOFF), {
      date: "Wednesday 18 November",
      short: "Wed 18 Nov",
      time: "12:00",
    });
  });

  it("does not depend on the process timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      assert.equal(formatCutoff("en", CUTOFF)?.time, "12:00");
      assert.equal(formatCutoff("en", CUTOFF)?.date, "Wednesday 18 November");
      process.env.TZ = "Asia/Tokyo";
      assert.equal(formatCutoff("fr", CUTOFF)?.time, "12h00");
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
describe("pricing enforces the cutoff on the server (tickets AND shop)", () => {
  const at = (iso: string) => {
    mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });
  };

  it("prices a ticket before the cutoff", async (t) => {
    t.after(() => mock.timers.reset());
    at("2026-11-18T11:59:59+01:00");
    const quote = await quoteTierCounts([{ tierId: "sonnet", quantity: 1 }]);
    assert.ok(quote.charged > 0);
  });

  it("refuses a ticket from 12:00 on — preview and checkout share this path", async (t) => {
    t.after(() => mock.timers.reset());
    at("2026-11-18T12:00:00+01:00");
    await assert.rejects(
      quoteTierCounts([{ tierId: "sonnet", quantity: 1 }]),
      (err: unknown) =>
        err instanceof CheckoutError && err.code === "ticket_sales_closed",
    );
  });

  it("prices the shop before the cutoff", async (t) => {
    t.after(() => mock.timers.reset());
    at("2026-11-18T11:59:59+01:00");
    const quote = await quoteCart([{ productId: "sticker-pack", quantity: 1 }]);
    assert.ok(quote.charged > 0);
  });

  it("refuses the shop too from 12:00 on — nothing is paid on the platform", async (t) => {
    t.after(() => mock.timers.reset());
    at("2026-11-19T10:00:00+01:00");
    await assert.rejects(
      quoteCart([{ productId: "sticker-pack", quantity: 1 }]),
      (err: unknown) =>
        err instanceof CheckoutError && err.code === "payments_closed",
    );
  });
});

/**
 * One time everywhere (ADR 0084): payments close at 12:00, so no message or
 * FAQ may still say the sales close at 23:59 (that is the EDITS deadline).
 */
describe("the payments cutoff reads 12:00 everywhere", () => {
  const STALE =
    /(payments?|sales?|paiements?|vente)[^.]{0,80}(18 novembre|18 November)[^.]{0,10}23[h:]59/i;
  const walk = (value: unknown, out: string[] = []): string[] => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => walk(v, out));
    else if (value && typeof value === "object") {
      Object.values(value).forEach((v) => walk(v, out));
    }
    return out;
  };

  it("in the UI messages and the FAQs", async () => {
    const { readFileSync } = await import("node:fs");
    const files = [
      "messages/en.json",
      "messages/fr.json",
      "src/data/faqs.json",
    ];
    for (const file of files) {
      const strings = walk(JSON.parse(readFileSync(file, "utf8")));
      for (const text of strings) {
        assert.doesNotMatch(text, STALE, `${file}: ${text.slice(0, 80)}`);
      }
    }
  });
});
