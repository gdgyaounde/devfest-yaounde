/**
 * Collector DP frames, photo shapes, typed badges and the paid-ticket
 * entitlement (ADR 0077, 0080).
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { collectorFrames } from "@/lib/dp/collector-frames";
import { collectorShapes } from "@/lib/dp/collector-shapes";
import {
  COLLECTOR_SHAPE_IDS,
  fitShape,
  isCollectorShapeId,
  polarRadius,
} from "@/lib/dp/shapes";
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
    assert.doesNotMatch(
      source,
      /pattern:\s*"(guilloche|constellation|shapes)"/,
    );
  });

  it("live in a server-only module", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/dp/collector-frames.ts"),
      "utf8",
    );
    assert.match(source, /^import "server-only";/m);
  });

  it("are three distinct patterns, flat colours, nothing personal on them", () => {
    const frames = collectorFrames();
    assert.deepEqual(
      frames.map((f) => f.id),
      [...COLLECTOR_FRAME_IDS],
    );
    assert.deepEqual(
      frames.map((f) => f.pattern),
      ["guilloche", "constellation", "shapes"],
    );
    for (const f of frames) {
      // The seal is the mark; no tier, serial or name is carried (ADR 0080).
      assert.equal(f.collector, true);
      assert.doesNotMatch(JSON.stringify(f), /tier|serial|OPUS|MYTHOS/i);
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
    assert.equal(isCollectorFrameId("collector-midnight"), true);
    assert.equal(isCollectorFrameId("collector-foil"), false);
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
      requireCollectorEntitlement("collector-shapes"),
      (err: unknown) =>
        err instanceof GalleryRejected && err.reason === "collector_locked",
    );
  });
});

describe("collector photo shapes (ADR 0080)", () => {
  it("are served from a server-only module, ids matching the public list", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/dp/collector-shapes.ts"),
      "utf8",
    );
    assert.match(source, /^import "server-only";/m);
    assert.deepEqual(
      collectorShapes().map((s) => s.id),
      [...COLLECTOR_SHAPE_IDS],
    );
    for (const s of collectorShapes()) assert.ok(s.label.fr && s.label.en);
  });

  it("are recognised by id", () => {
    assert.equal(isCollectorShapeId("shape-sparkle"), true);
    assert.equal(isCollectorShapeId("rounded"), false);
  });

  it("keep lobe tips on the edge and valleys at the stated depth", () => {
    const recipe = {
      kind: "polar" as const,
      lobes: 4,
      depth: 0.2,
      sharpness: 1,
    };
    assert.ok(Math.abs(polarRadius(recipe, 0) - 1) < 1e-9);
    assert.ok(Math.abs(polarRadius(recipe, Math.PI / 4) - 0.8) < 1e-9);
  });

  it("leave a face room: every polar shape keeps 80 %+ of its radius", () => {
    for (const { recipe } of collectorShapes()) {
      if (recipe.kind !== "polar") continue;
      for (let i = 0; i < 360; i++) {
        assert.ok(
          polarRadius(recipe, (i * Math.PI) / 180) >= 0.77,
          recipe.kind,
        );
      }
    }
  });

  it("fit a portrait box with at most an 18 % stretch, centred", () => {
    const square = fitShape(0, 0, 100, 100);
    assert.deepEqual(square, { cx: 50, cy: 50, rx: 50, ry: 50 });
    const tall = fitShape(0, 0, 100, 140);
    assert.equal(tall.rx, 50);
    assert.equal(tall.ry, 59);
    assert.equal(tall.cy, 70);
  });
});

describe("wall saves — shapes and typed badges (ADR 0080)", () => {
  const locked = (err: unknown) =>
    err instanceof GalleryRejected && err.reason === "collector_locked";

  it("refuse a collector shape from somebody not signed in", async () => {
    await assert.rejects(
      requireCollectorEntitlement("confetti", { shape: "shape-clover" }),
      locked,
    );
  });

  it("refuse a typed badge from somebody not signed in", async () => {
    await assert.rejects(
      requireCollectorEntitlement("confetti", { customBadge: true }),
      locked,
    );
  });

  it("let a public card through with no perks claimed", async () => {
    await assert.doesNotReject(
      requireCollectorEntitlement("confetti", {
        shape: "",
        customBadge: false,
      }),
    );
  });
});
