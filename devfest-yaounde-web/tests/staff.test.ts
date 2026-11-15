/**
 * Day-of staff rules (ADR 0079): volunteer expiry, what a pass includes at
 * the meal and swag tables, name-search cleaning, and merch hand-over.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canHandOver,
  cleanNameQuery,
  fulfilmentMethod,
  isVolunteerActive,
  matchesOrderQuery,
  orderRef,
  perkEligibility,
  volunteerExpiry,
} from "@/lib/staff/rules";

describe("volunteer access", () => {
  it("ends at 23:59 Yaoundé the day after the event", () => {
    assert.equal(volunteerExpiry("2026-11-21"), "2026-11-22T23:59:00+01:00");
    // Month and year boundaries.
    assert.equal(volunteerExpiry("2026-11-30"), "2026-12-01T23:59:00+01:00");
    assert.equal(volunteerExpiry("2026-12-31"), "2027-01-01T23:59:00+01:00");
  });

  it("rejects a malformed event date rather than guessing", () => {
    assert.throws(() => volunteerExpiry("21/11/2026"));
  });

  it("is active until the expiry instant, and not at it", () => {
    const end = "2026-11-22T23:59:00+01:00";
    assert.equal(
      isVolunteerActive(end, new Date("2026-11-22T22:58:59Z")),
      true,
    );
    assert.equal(
      isVolunteerActive(end, new Date("2026-11-22T22:59:00Z")),
      false,
    );
    assert.equal(isVolunteerActive("not a date", new Date()), false);
  });
});

describe("perkEligibility", () => {
  const paid = {
    priceXAF: 5000,
    swagProductIds: ["tee-edition"],
    includesApparel: true,
  };

  it("gives a paid pass its meal and its swag", () => {
    assert.deepEqual(
      perkEligibility({ perk: "meal", tier: paid, refund: null }),
      { ok: true },
    );
    assert.deepEqual(
      perkEligibility({ perk: "swag", tier: paid, refund: null }),
      { ok: true },
    );
  });

  it("gives a free pass neither", () => {
    const free = { priceXAF: 0 };
    for (const perk of ["meal", "swag"] as const) {
      assert.deepEqual(perkEligibility({ perk, tier: free, refund: null }), {
        ok: false,
        reason: "free_pass",
      });
    }
  });

  it("takes both back once the refund was paid out — but not while it is open", () => {
    assert.deepEqual(
      perkEligibility({ perk: "meal", tier: paid, refund: "refunded" }),
      { ok: false, reason: "refunded" },
    );
    assert.deepEqual(
      perkEligibility({ perk: "swag", tier: paid, refund: "pending" }),
      { ok: true },
    );
  });

  it("refuses swag to a paid pass that bundles none", () => {
    assert.deepEqual(
      perkEligibility({
        perk: "swag",
        tier: { priceXAF: 2000, swagProductIds: [] },
        refund: null,
      }),
      { ok: false, reason: "not_in_pass" },
    );
    // Apparel alone counts as swag.
    assert.deepEqual(
      perkEligibility({
        perk: "swag",
        tier: { priceXAF: 2000, includesApparel: true },
        refund: null,
      }),
      { ok: true },
    );
  });

  it("treats a tier that no longer exists as not included", () => {
    assert.deepEqual(
      perkEligibility({ perk: "meal", tier: null, refund: null }),
      { ok: false, reason: "not_in_pass" },
    );
  });
});

describe("cleanNameQuery", () => {
  it("keeps names, accents included", () => {
    assert.equal(cleanNameQuery("  Ngo'o  Élodie "), "Ngo'o Élodie");
    assert.equal(cleanNameQuery("Jean-Marc"), "Jean-Marc");
  });

  it("strips pattern and filter characters so a search cannot widen", () => {
    assert.equal(cleanNameQuery("%%%"), null);
    assert.equal(cleanNameQuery("a%b_c*"), "a b c");
    assert.equal(cleanNameQuery("abc,name.ilike.*"), "abc name.ilike.");
    assert.equal(cleanNameQuery("ana)(or"), "ana or");
  });

  it("needs at least three letters", () => {
    assert.equal(cleanNameQuery("ab"), null);
    assert.equal(cleanNameQuery("a b"), null);
    assert.equal(cleanNameQuery("a-b."), null);
    assert.equal(cleanNameQuery("abc"), "abc");
  });

  it("caps the length", () => {
    assert.equal(cleanNameQuery("x".repeat(200))?.length, 60);
  });
});

describe("merch pickup", () => {
  const id = "4b01c6eb-330a-4474-aece-24dcf62c194f";

  it("shows an 8-character order number", () => {
    assert.equal(orderRef(id), "4B01C6EB");
  });

  it("matches by order number, with or without #", () => {
    assert.equal(matchesOrderQuery("4b01c6eb", { id, buyerName: null }), true);
    assert.equal(matchesOrderQuery("#4B01", { id, buyerName: null }), true);
    assert.equal(matchesOrderQuery("4b02", { id, buyerName: null }), false);
  });

  it("matches by part of the buyer's name, ignoring case and accents", () => {
    const order = { id, buyerName: "Hélène Mbarga" };
    assert.equal(matchesOrderQuery("helene", order), true);
    assert.equal(matchesOrderQuery("MBAR", order), true);
    assert.equal(matchesOrderQuery("he", order), false);
  });

  it("hands over pickup orders only, through the lifecycle's own steps", () => {
    assert.deepEqual(
      canHandOver({ status: "ready_for_pickup", method: "pickup" }),
      {
        ok: true,
        steps: ["delivered"],
      },
    );
    assert.deepEqual(canHandOver({ status: "processing", method: "pickup" }), {
      ok: true,
      steps: ["ready_for_pickup", "delivered"],
    });
    assert.deepEqual(
      canHandOver({ status: "processing", method: "shipping" }),
      {
        ok: false,
        reason: "not_pickup",
      },
    );
    assert.deepEqual(canHandOver({ status: "delivered", method: "pickup" }), {
      ok: false,
      reason: "already_handed_over",
    });
    assert.deepEqual(canHandOver({ status: "cancelled", method: "pickup" }), {
      ok: false,
      reason: "cancelled",
    });
  });

  it("reads the pickup method wherever checkout recorded it", () => {
    assert.equal(
      fulfilmentMethod({ requested: { method: "pickup" } }),
      "pickup",
    );
    assert.equal(fulfilmentMethod({ method: "shipping" }), "shipping");
    assert.equal(fulfilmentMethod(null), null);
  });
});
