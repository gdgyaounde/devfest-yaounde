/**
 * What a pack offers at the door (ADR 0091): the door must never promise what
 * the meal and swag tables would refuse. Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPack } from "@/lib/staff/pack";

const L = (en: string) => ({ en, fr: en });
const products = [
  { id: "mug", name: L("Mug") },
  { id: "cap", name: L("Bucket hat") },
];
const paid = {
  priceXAF: 5000,
  perks: [{ label: L("Lunch and coffee breaks") }],
  swagProductIds: ["mug", "cap", "gone"],
  includesApparel: true,
};

describe("a pack at the door", () => {
  it("lists meal, swag, the bag and the shirt size for a paid pass", () => {
    const p = buildPack({
      tier: paid,
      products,
      refund: null,
      apparelSize: "M",
    });
    assert.equal(p.meal, true);
    assert.equal(p.swag, true);
    assert.deepEqual(
      p.items.map((i) => i.en),
      ["Mug", "Bucket hat"],
      "a deleted product is skipped",
    );
    assert.equal(p.apparelSize, "M");
    assert.deepEqual(
      p.perks.map((x) => x.en),
      ["Lunch and coffee breaks"],
    );
  });

  it("says 'shirt, but no size' differently from 'no shirt'", () => {
    assert.equal(
      buildPack({ tier: paid, products, refund: null, apparelSize: null })
        .apparelSize,
      null,
    );
    const noShirt = buildPack({
      tier: { ...paid, includesApparel: false },
      products,
      refund: null,
      apparelSize: null,
    });
    assert.equal("apparelSize" in noShirt, false);
  });

  it("is entry only for a free pass", () => {
    const p = buildPack({
      tier: { priceXAF: 0 },
      products,
      refund: null,
      apparelSize: null,
    });
    assert.deepEqual(
      [p.entry, p.meal, p.swag, p.reason],
      [true, false, false, "free_pass"],
    );
    assert.deepEqual(p.items, []);
  });

  it("is entry only once the money went back, but keeps everything while a request is merely open", () => {
    assert.equal(
      buildPack({ tier: paid, products, refund: "refunded", apparelSize: "M" })
        .meal,
      false,
    );
    assert.equal(
      buildPack({ tier: paid, products, refund: "refunded", apparelSize: "M" })
        .reason,
      "refunded",
    );
    assert.equal(
      buildPack({ tier: paid, products, refund: "pending", apparelSize: "M" })
        .meal,
      true,
    );
  });

  it("treats an unknown tier as not included", () => {
    const p = buildPack({
      tier: null,
      products,
      refund: null,
      apparelSize: null,
    });
    assert.deepEqual([p.meal, p.swag, p.reason], [false, false, "not_in_pass"]);
  });
});
