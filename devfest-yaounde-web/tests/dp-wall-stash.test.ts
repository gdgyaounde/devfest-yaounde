/**
 * One card on the wall per photo, per visit (ADR 0081).
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { planWallStash } from "@/lib/dp/wall-stash";

describe("planWallStash", () => {
  const card = { key: "ada|midnight|clover", photoKey: 1 };

  it("submits the first card of the visit", () => {
    assert.equal(planWallStash(null, card), "submit");
  });

  it("skips the same card pressed again — download, then share, then copy", () => {
    assert.equal(planWallStash(card, { ...card }), "skip");
  });

  it("replaces the card when it was edited since", () => {
    assert.equal(
      planWallStash(card, { ...card, key: "ada|midnight|sparkle" }),
      "replace",
    );
  });

  it("keeps both when it is a different photo — cards for friends", () => {
    assert.equal(planWallStash(card, { key: card.key, photoKey: 2 }), "submit");
  });
});
