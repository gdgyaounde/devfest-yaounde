/**
 * Collector DP frames and the paid-ticket entitlement (ADR 0077).
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { collectorFrames } from "@/lib/dp/collector-frames";
import {
  COLLECTOR_FRAME_IDS,
  DP_FRAMES,
  isCollectorFrameId,
} from "@/lib/dp/frames";
import {
  GalleryRejected,
  requireCollectorEntitlement,
} from "@/lib/dp/gallery-server";
import {
  paidEntitlementFrom,
  type EntitlementTicket,
} from "@/lib/tickets/entitlement-rule";

const TIERS = [
  { id: "haikyu", name: "HAIKYU", priceXAF: 0 },
  { id: "sonnet", name: "SONNET", priceXAF: 3500 },
  { id: "mythos", name: "MYTHOS", priceXAF: 25000 },
];

const ticket = (over: Partial<EntitlementTicket>): EntitlementTicket => ({
  id: "t1",
  tier_id: "sonnet",
  badge_code: "ABCD",
  deposit_id: "dep-1",
  is_self: true,
  claimed_at: null,
  ...over,
});

describe("paid-ticket entitlement", () => {
  it("unlocks for a paid ticket the user holds themselves", () => {
    assert.deepEqual(paidEntitlementFrom([ticket({})], TIERS, new Set()), {
      entitled: true,
      tierId: "sonnet",
      tierName: "SONNET",
    });
  });

  it("does NOT unlock through a friend's unclaimed ticket the user bought", () => {
    const r = paidEntitlementFrom(
      [ticket({ is_self: false, claimed_at: null })],
      TIERS,
      new Set(),
    );
    assert.equal(r.entitled, false);
  });

  it("unlocks once a ticket is claimed into the account", () => {
    const r = paidEntitlementFrom(
      [ticket({ is_self: false, claimed_at: "2026-11-10T10:00:00Z" })],
      TIERS,
      new Set(),
    );
    assert.equal(r.entitled, true);
  });

  it("never unlocks on a free tier", () => {
    const r = paidEntitlementFrom(
      [ticket({ tier_id: "haikyu" })],
      TIERS,
      new Set(),
    );
    assert.equal(r.entitled, false);
  });

  it("excludes a ticket with a granted refund (any of its identifiers)", () => {
    for (const ref of ["t1", "abcd", "dep-1"]) {
      const r = paidEntitlementFrom([ticket({})], TIERS, new Set([ref]));
      assert.equal(r.entitled, false, ref);
    }
  });

  it("reports the highest qualifying tier for the stub's serial", () => {
    const r = paidEntitlementFrom(
      [
        ticket({ id: "a", tier_id: "sonnet" }),
        ticket({ id: "b", tier_id: "mythos", badge_code: "EFGH" }),
        ticket({ id: "c", tier_id: "mythos", is_self: false }),
      ],
      TIERS,
      new Set(),
    );
    assert.equal(r.tierName, "MYTHOS");
  });

  it("is not entitled with no tickets", () => {
    assert.equal(paidEntitlementFrom([], TIERS, new Set()).entitled, false);
  });
});

describe("the collector frames are gated, not hidden", () => {
  it("are not in the public catalog that ships to the browser", () => {
    for (const id of COLLECTOR_FRAME_IDS) {
      assert.equal(
        DP_FRAMES.some((f) => f.id === id),
        false,
        id,
      );
    }
    const source = readFileSync(
      join(process.cwd(), "src/lib/dp/frames.ts"),
      "utf8",
    );
    assert.doesNotMatch(source, /pattern:\s*"(foil|stub)"/);
  });

  it("live in a server-only module", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/dp/collector-frames.ts"),
      "utf8",
    );
    assert.match(source, /^import "server-only";/m);
  });

  it("are two distinct new patterns, flat yellow-family colours, carrying the tier", () => {
    const frames = collectorFrames("OPUS");
    assert.deepEqual(
      frames.map((f) => f.id),
      [...COLLECTOR_FRAME_IDS],
    );
    assert.deepEqual(
      frames.map((f) => f.pattern),
      ["foil", "stub"],
    );
    for (const f of frames) {
      assert.equal(f.collector?.tierName, "OPUS");
      for (const colour of [
        f.background,
        f.accent,
        f.foreground,
        f.plate,
        ...(f.palette ?? []),
      ]) {
        assert.match(colour, /^#[0-9A-F]{6}$/i, `${f.id}: ${colour}`);
      }
      assert.ok(f.label.fr && f.label.en);
    }
  });

  it("are recognised by id", () => {
    assert.equal(isCollectorFrameId("collector-foil"), true);
    assert.equal(isCollectorFrameId("confetti"), false);
  });
});

describe("wall saves", () => {
  it("let any public frame through without a sign-in", async () => {
    await assert.doesNotReject(requireCollectorEntitlement("confetti"));
    await assert.doesNotReject(requireCollectorEntitlement(""));
  });

  it("refuse a collector frame from somebody not signed in", async () => {
    await assert.rejects(
      requireCollectorEntitlement("collector-stub"),
      (err: unknown) =>
        err instanceof GalleryRejected && err.reason === "collector_locked",
    );
  });
});
