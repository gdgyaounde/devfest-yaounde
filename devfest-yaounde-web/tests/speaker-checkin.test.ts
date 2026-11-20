/**
 * Speaker check-in rules and the viewer's-zone time (ADR 0092). Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { localTimeFor } from "@/lib/local-time";
import { cleanNote, patchFor, speakerActionSchema } from "@/lib/staff/speakers";

describe("speaker marks", () => {
  it("stamps on, clears off, and cleans a note", () => {
    const now = "2026-11-21T08:30:00.000Z";
    assert.deepEqual(
      patchFor({ speakerId: "a", action: "arrived", on: true }, now),
      { checked_in_at: now },
    );
    assert.deepEqual(
      patchFor({ speakerId: "a", action: "swag", on: false }, now),
      { swag_collected_at: null },
    );
    assert.deepEqual(
      patchFor({ speakerId: "a", action: "note", note: "  no   pen \n" }, now),
      { note: "no pen" },
    );
    assert.deepEqual(
      patchFor({ speakerId: "a", action: "note", note: "   " }, now),
      { note: null },
    );
  });

  it("accepts only the known actions and no extra fields", () => {
    assert.equal(
      speakerActionSchema.safeParse({
        speakerId: "a",
        action: "arrived",
        on: true,
      }).success,
      true,
    );
    assert.equal(
      speakerActionSchema.safeParse({
        speakerId: "a",
        action: "delete",
        on: true,
      }).success,
      false,
    );
    assert.equal(
      speakerActionSchema.safeParse({
        speakerId: "a",
        action: "arrived",
        on: true,
        x: 1,
      }).success,
      false,
    );
    assert.equal(
      speakerActionSchema.safeParse({
        speakerId: "a",
        action: "note",
        note: "x".repeat(501),
      }).success,
      false,
    );
  });

  it("caps a note", () => {
    assert.equal(cleanNote("x".repeat(900))?.length, 500);
  });
});

describe("a session in the viewer's own time", () => {
  it("converts for a speaker in New York (UTC-5 in November)", () => {
    const r = localTimeFor("2026-11-21", "09:20", "en", "America/New_York");
    assert.equal(r?.time, "03:20");
    assert.equal(r?.dayShift, 0);
  });

  it("shows a day shift across the date line", () => {
    const r = localTimeFor("2026-11-21", "17:30", "en", "Pacific/Auckland");
    assert.equal(r?.time, "05:30");
    assert.equal(r?.dayShift, 1);
    assert.equal(
      localTimeFor("2026-11-21", "00:30", "en", "America/Los_Angeles")
        ?.dayShift,
      -1,
    );
  });

  it("adds nothing on Yaoundé time, and for zones sharing it", () => {
    assert.equal(
      localTimeFor("2026-11-21", "09:20", "en", "Africa/Douala"),
      null,
    );
    assert.equal(
      localTimeFor("2026-11-21", "09:20", "fr", "Africa/Lagos"),
      null,
    );
  });

  it("returns null for a bad time", () => {
    assert.equal(localTimeFor("2026-11-21", "nope", "en", "UTC"), null);
  });
});
