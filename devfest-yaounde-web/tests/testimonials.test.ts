/**
 * Anonymous testimonials (ADR 0087): the pure rules. Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MESSAGE_MAX,
  MESSAGE_MIN,
  TESTIMONIAL_EDITIONS,
  checkTestimonial,
  cleanMessage,
  storyOrder,
  testimonialSchema,
} from "@/lib/testimonials/rules";

const base = {
  message: "DevFest is where I gave my very first talk, and found my people.",
  locale: "en" as const,
};

describe("the testimonial request", () => {
  it("accepts a message alone, and optional role/edition choices", () => {
    assert.equal(testimonialSchema.safeParse(base).success, true);
    assert.equal(
      testimonialSchema.safeParse({
        ...base,
        role: { kind: "preset", value: "speaker" },
        edition: { kind: "other", value: "DevFest 2015 (pre-GDG)" },
      }).success,
      true,
    );
  });

  it("refuses an unknown preset, unknown fields and a name", () => {
    assert.equal(
      testimonialSchema.safeParse({
        ...base,
        role: { kind: "preset", value: "ceo" },
      }).success,
      false,
    );
    assert.equal(
      testimonialSchema.safeParse({ ...base, name: "Ada" }).success,
      false,
      "no field may carry who wrote it",
    );
  });

  it("lists every edition from 2016 to 2026", () => {
    assert.equal(TESTIMONIAL_EDITIONS[0], "2026");
    assert.equal(TESTIMONIAL_EDITIONS.at(-1), "2016");
    assert.equal(TESTIMONIAL_EDITIONS.length, 11);
  });
});

describe("checking a testimonial", () => {
  it("enforces the length after cleaning whitespace", () => {
    assert.deepEqual(
      checkTestimonial({ ...base, message: "   too short   " }),
      {
        ok: false,
        error: "too_short",
      },
    );
    assert.equal(
      checkTestimonial({ ...base, message: "x".repeat(MESSAGE_MAX + 1) }).ok,
      false,
    );
    assert.equal(
      checkTestimonial({ ...base, message: "y".repeat(MESSAGE_MIN) }).ok,
      true,
    );
  });

  it("treats a filled honeypot as spam", () => {
    assert.deepEqual(checkTestimonial({ ...base, website: "http://x" }), {
      ok: false,
      error: "spam",
    });
  });

  it("stores role and edition as plain text", () => {
    const r = checkTestimonial({
      ...base,
      role: { kind: "other", value: "  Photographer  " },
      edition: { kind: "preset", value: "2019" },
    });
    assert.deepEqual(r, {
      ok: true,
      message: base.message,
      role: "Photographer",
      edition: "2019",
    });
  });

  it("cleans control characters and runs of blank lines", () => {
    assert.equal(cleanMessage("a\u0000b\n\n\n\nc  d"), "ab\n\nc d");
  });
});

describe("story order", () => {
  it("walks the years oldest first, undated last", () => {
    const rows = [
      { id: "a", edition: null, createdAt: "2026-11-18T10:00:00Z" },
      { id: "b", edition: "2024", createdAt: "2026-11-18T09:00:00Z" },
      {
        id: "c",
        edition: "DevFest 2017 (first)",
        createdAt: "2026-11-18T11:00:00Z",
      },
      { id: "d", edition: "2024", createdAt: "2026-11-18T08:00:00Z" },
    ];
    assert.deepEqual(
      storyOrder(rows).map((r) => r.id),
      ["c", "d", "b", "a"],
    );
  });
});
