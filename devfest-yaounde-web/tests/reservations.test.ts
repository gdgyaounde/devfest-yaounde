/**
 * Reservations (ADR 0084): validation, base-price arithmetic, the phase gate
 * and references.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Product, TicketTier } from "@/data/types";
import {
  normaliseReference,
  priceReservation,
  referenceFrom,
  reservationGate,
  reservationSchema,
  ReservationError,
} from "@/lib/reservations/rules";

const tier = (over: Partial<TicketTier>): TicketTier =>
  ({
    id: "sonnet",
    name: "SONNET",
    priceXAF: 3500,
    description: { fr: "", en: "" },
    perks: [],
    includesApparel: true,
    onSale: true,
    ...over,
  }) as TicketTier;
const product = (over: Partial<Product>): Product =>
  ({
    id: "mug",
    name: { fr: "Mug", en: "Mug" },
    description: { fr: "", en: "" },
    priceXAF: 4000,
    images: [],
    status: "in-stock",
    ...over,
  }) as Product;

const tiers = [
  tier({}),
  tier({
    id: "opus",
    name: "OPUS",
    priceXAF: 5000,
    includesApparel: false,
    quantityAvailable: 20,
  }),
  tier({
    id: "haikyu",
    name: "HAIKYU",
    priceXAF: 0,
    rsvpExternal: true,
    includesApparel: false,
  }),
  tier({ id: "old", name: "OLD", onSale: false }),
];
const products = [
  product({}),
  product({ id: "tee", priceXAF: 6000, variants: { size: ["M", "L"] } }),
  product({ id: "gone", status: "sold-out" }),
  product({ id: "venue", priceXAF: 1000, status: "venue-only" }),
  product({ id: "cert", ticketOnly: true }),
];
const throwsCode = (fn: () => unknown, code: string) =>
  assert.throws(
    fn,
    (err: unknown) => err instanceof ReservationError && err.code === code,
  );

const valid = {
  contact: { name: "Ada Fotso", phone: "+237 6 99 00 00 00" },
  tickets: [{ tierId: "sonnet", name: "Ada Fotso", apparelSize: "M" }],
  items: [],
  acceptedCash: true,
  locale: "en",
};

describe("reservationSchema", () => {
  it("accepts a normal reservation", () => {
    assert.equal(reservationSchema.safeParse(valid).success, true);
  });

  it("is strict: no price, no user id, no extra keys", () => {
    for (const extra of [
      { totalXaf: 1 },
      { userId: "x" },
      { status: "cash_received" },
    ]) {
      assert.equal(
        reservationSchema.safeParse({ ...valid, ...extra }).success,
        false,
      );
    }
    assert.equal(
      reservationSchema.safeParse({
        ...valid,
        tickets: [{ tierId: "sonnet", name: "Ada Fotso", price: 1 }],
      }).success,
      false,
    );
  });

  it("needs the cash acknowledgement and something to reserve", () => {
    assert.equal(
      reservationSchema.safeParse({ ...valid, acceptedCash: false }).success,
      false,
    );
    assert.equal(
      reservationSchema.safeParse({ ...valid, tickets: [], items: [] }).success,
      false,
    );
  });

  it("checks the phone, names and size", () => {
    const bad = (patch: object) =>
      reservationSchema.safeParse({ ...valid, ...patch }).success;
    assert.equal(bad({ contact: { ...valid.contact, phone: "12" } }), false);
    assert.equal(
      bad({ contact: { ...valid.contact, phone: "abc12345678" } }),
      false,
    );
    assert.equal(bad({ contact: { ...valid.contact, name: "A" } }), false);
    assert.equal(
      bad({
        tickets: [{ tierId: "sonnet", name: "Ada", apparelSize: "XXXL" }],
      }),
      false,
    );
    assert.equal(bad({ contact: { ...valid.contact, email: "" } }), true);
  });

  it("caps a reservation at ten tickets", () => {
    const eleven = Array.from({ length: 11 }, () => valid.tickets[0]);
    assert.equal(
      reservationSchema.safeParse({ ...valid, tickets: eleven }).success,
      false,
    );
  });
});

describe("priceReservation (cash, base prices)", () => {
  it("adds up tickets and shop lines at BASE price — no online fee", () => {
    const priced = priceReservation(
      {
        tickets: [
          { tierId: "sonnet", name: "Ada", apparelSize: "M" },
          { tierId: "opus", name: "Bruno" },
        ],
        items: [
          { productId: "mug", quantity: 2 },
          { productId: "tee", quantity: 1, variant: { size: "L" } },
        ],
      },
      tiers,
      products,
    );
    assert.equal(priced.totalXaf, 3500 + 5000 + 2 * 4000 + 6000);
    assert.deepEqual(priced.caps, { sonnet: null, opus: 20 });
  });

  it("refuses the free pass, retired tiers and unknown tiers", () => {
    throwsCode(
      () =>
        priceReservation(
          { tickets: [{ tierId: "haikyu", name: "Ada" }], items: [] },
          tiers,
          products,
        ),
      "tier_not_reservable",
    );
    throwsCode(
      () =>
        priceReservation(
          {
            tickets: [{ tierId: "old", name: "Ada", apparelSize: "M" }],
            items: [],
          },
          tiers,
          products,
        ),
      "tier_not_reservable",
    );
    throwsCode(
      () =>
        priceReservation(
          { tickets: [{ tierId: "zzz", name: "Ada" }], items: [] },
          tiers,
          products,
        ),
      "unknown_tier",
    );
  });

  it("requires a size on an apparel tier", () => {
    throwsCode(
      () =>
        priceReservation(
          { tickets: [{ tierId: "sonnet", name: "Ada" }], items: [] },
          tiers,
          products,
        ),
      "apparel_size_required",
    );
  });

  it("refuses sold-out and ticket-only products, accepts venue-only", () => {
    throwsCode(
      () =>
        priceReservation(
          { tickets: [], items: [{ productId: "gone", quantity: 1 }] },
          tiers,
          products,
        ),
      "product_unavailable",
    );
    throwsCode(
      () =>
        priceReservation(
          { tickets: [], items: [{ productId: "cert", quantity: 1 }] },
          tiers,
          products,
        ),
      "product_unavailable",
    );
    assert.equal(
      priceReservation(
        { tickets: [], items: [{ productId: "venue", quantity: 3 }] },
        tiers,
        products,
      ).totalXaf,
      3000,
    );
  });

  it("checks variants against what the product lists", () => {
    throwsCode(
      () =>
        priceReservation(
          { tickets: [], items: [{ productId: "tee", quantity: 1 }] },
          tiers,
          products,
        ),
      "invalid_variant",
    );
    throwsCode(
      () =>
        priceReservation(
          {
            tickets: [],
            items: [
              { productId: "tee", quantity: 1, variant: { size: "XXL" } },
            ],
          },
          tiers,
          products,
        ),
      "invalid_variant",
    );
  });

  it("refuses an empty reservation", () => {
    throwsCode(
      () => priceReservation({ tickets: [], items: [] }, tiers, products),
      "empty_reservation",
    );
  });
});

describe("reservationGate", () => {
  it("opens only between the cutoff and the deadline", () => {
    assert.equal(reservationGate("selling"), "reservations_not_open");
    assert.equal(reservationGate("reserving"), null);
    assert.equal(reservationGate("door"), "reservations_closed");
  });
});

describe("references", () => {
  it("are RES- plus six unambiguous characters", () => {
    const ref = referenceFrom(Uint8Array.from([0, 1, 2, 3, 250, 255]));
    assert.match(ref, /^RES-[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it("are read forgivingly at the door", () => {
    assert.equal(normaliseReference("res-ab3cd9"), "RES-AB3CD9");
    assert.equal(normaliseReference(" RES AB3CD9 "), "RES-AB3CD9");
    assert.equal(normaliseReference("ab3cd9"), "RES-AB3CD9");
    assert.equal(normaliseReference("RES-ABOCD9"), "RES-AB0CD9");
  });

  it("rejects anything that is not one", () => {
    assert.equal(normaliseReference("RES-AB3CD"), null);
    assert.equal(normaliseReference("hello"), null);
    assert.equal(normaliseReference("RES-AB3CDU"), null);
  });
});
