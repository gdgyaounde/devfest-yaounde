/**
 * Commerce recap (ADR 0083): what to stock for the day.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { commerceRecap, variantLabel } from "@/lib/admin/commerce-recap";

const tiers = [
  { id: "haikyu", name: "HAIKYU", priceXAF: 0 },
  {
    id: "sonnet",
    name: "SONNET",
    priceXAF: 3500,
    swagProductIds: ["tee", "pen"],
  },
  {
    id: "opus",
    name: "OPUS",
    priceXAF: 5000,
    swagProductIds: ["tee", "pen", "notebook"],
  },
];
const products = [
  { id: "tee", name: { en: "T-shirt", fr: "T-shirt" } },
  { id: "pen", name: { en: "Pen", fr: "Stylo" } },
  { id: "notebook", name: { en: "Notebook", fr: "Carnet" } },
  { id: "mug", name: { en: "Mug", fr: "Mug" } },
];
const ticket = (n: number, tier: string) => ({
  id: `id-${tier}-${n}`,
  badge_code: `DFY-${tier}-${n}`,
  deposit_id: `dep-${tier}-${n}`,
  tier_id: tier,
});
const base = {
  tiers,
  products,
  tickets: [ticket(1, "sonnet"), ticket(2, "sonnet"), ticket(1, "opus")],
  orders: [],
  refunded: new Set<string>(),
};

describe("commerceRecap", () => {
  it("counts tickets per tier and brings each tier's box per ticket", () => {
    const r = commerceRecap(base);
    assert.deepEqual(
      r.tickets.map((t) => [t.tierId, t.sold]),
      [
        ["sonnet", 2],
        ["opus", 1],
      ],
    );
    assert.equal(r.ticketsSold, 3);
    const by = Object.fromEntries(r.swag.map((s) => [s.productId, s]));
    assert.equal(by.tee.fromTickets, 3); // 2 sonnet + 1 opus
    assert.equal(by.pen.fromTickets, 3);
    assert.equal(by.notebook.fromTickets, 1); // opus only
  });

  it("adds shop orders to the same item, and counts shop-only items", () => {
    const r = commerceRecap({
      ...base,
      orders: [
        {
          id: "o1",
          status: "processing",
          items: [
            {
              productId: "tee",
              name: "x",
              quantity: 2,
              unitAmount: 6000,
              variant: { size: "M" },
            },
            {
              productId: "mug",
              name: "x",
              quantity: 1,
              unitAmount: 4000,
              variant: null,
            },
          ],
        },
      ],
    });
    const by = Object.fromEntries(r.swag.map((s) => [s.productId, s]));
    assert.equal(by.tee.total, 5); // 3 from tickets + 2 bought
    assert.equal(by.tee.fromShop, 2);
    assert.equal(by.mug.fromTickets, 0);
    assert.equal(by.mug.total, 1);
    assert.equal(r.shopUnits, 3);
    assert.equal(r.shopRevenue, 16000);
  });

  it("keeps variants as separate shop rows", () => {
    const line = (size: string) => ({
      productId: "tee",
      name: "x",
      quantity: 1,
      unitAmount: 6000,
      variant: { size },
    });
    const r = commerceRecap({
      ...base,
      orders: [
        {
          id: "o",
          status: "delivered",
          items: [line("M"), line("L"), line("M")],
        },
      ],
    });
    assert.deepEqual(
      r.shop.map((s) => [s.variant, s.quantity]),
      [
        ["size L", 1],
        ["size M", 2],
      ],
    );
  });

  it("leaves out cancelled orders and refunded tickets and orders", () => {
    const r = commerceRecap({
      ...base,
      refunded: new Set(["dfy-sonnet-1", "o2"]),
      orders: [
        {
          id: "o1",
          status: "cancelled",
          items: [
            {
              productId: "mug",
              name: "x",
              quantity: 5,
              unitAmount: 1,
              variant: null,
            },
          ],
        },
        {
          id: "o2",
          status: "processing",
          items: [
            {
              productId: "mug",
              name: "x",
              quantity: 5,
              unitAmount: 1,
              variant: null,
            },
          ],
        },
      ],
    });
    assert.equal(r.tickets.find((t) => t.tierId === "sonnet")?.sold, 1);
    assert.equal(r.shopUnits, 0);
    assert.equal(
      r.swag.find((s) => s.productId === "mug"),
      undefined,
    );
  });

  it("matches refund references case-insensitively, by any id of the ticket", () => {
    const r = commerceRecap({ ...base, refunded: new Set(["dep-opus-1"]) });
    assert.equal(
      r.tickets.find((t) => t.tierId === "opus"),
      undefined,
    );
  });

  it("counts a product once per ticket even if a tier lists it twice", () => {
    const r = commerceRecap({
      ...base,
      tiers: [
        {
          id: "sonnet",
          name: "SONNET",
          priceXAF: 1,
          swagProductIds: ["tee", "tee"],
        },
      ],
      tickets: [ticket(1, "sonnet")],
    });
    assert.equal(r.swag[0].fromTickets, 1);
  });

  it("labels a variant, and nothing for none", () => {
    assert.equal(
      variantLabel({ size: "M", color: "blanc" }),
      "size M · colour blanc",
    );
    assert.equal(variantLabel(null), "");
  });

  it("counts reservations as their own column, boxes included, leaving out cancelled ones (ADR 0084)", () => {
    const r = commerceRecap({
      ...base,
      reservations: [
        {
          status: "reserved",
          tickets: [{ tierId: "sonnet" }, { tierId: "opus" }],
          items: [{ productId: "mug", quantity: 2 }],
        },
        {
          status: "cash_received",
          tickets: [{ tierId: "sonnet" }],
          items: [{ productId: "tee", quantity: 1, variant: { size: "M" } }],
        },
        {
          status: "cancelled",
          tickets: [{ tierId: "opus" }],
          items: [{ productId: "mug", quantity: 9 }],
        },
      ],
    });
    assert.equal(r.ticketsReserved, 3);
    assert.equal(r.tickets.find((t) => t.tierId === "sonnet")?.reserved, 2);
    assert.equal(r.tickets.find((t) => t.tierId === "opus")?.reserved, 1);
    const by = Object.fromEntries(r.swag.map((x) => [x.productId, x]));
    // tee: 3 paid-ticket boxes + 3 reserved-ticket boxes + 1 reserved line.
    assert.equal(by.tee.fromTickets, 3);
    assert.equal(by.tee.fromReservations, 3 + 1);
    assert.equal(by.tee.total, 3 + 4);
    // mug: shop-only, reserved 2 (the cancelled 9 is ignored).
    assert.equal(by.mug.fromReservations, 2);
    assert.deepEqual(
      r.reservedShop.map((x) => [x.productId, x.variant, x.quantity]),
      [
        ["mug", "", 2],
        ["tee", "size M", 1],
      ],
    );
  });
});
