/**
 * Door check-in (ADR 0078): what the scanner accepts as a badge code, and
 * what a refund on file means at the door.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BADGE_CODE_RE,
  normaliseBadgeCode,
  refundStanding,
} from "@/lib/tickets/check-in";

describe("normaliseBadgeCode", () => {
  it("accepts a code exactly as printed", () => {
    assert.equal(normaliseBadgeCode("DFY-AB3CD-9XYZ2"), "DFY-AB3CD-9XYZ2");
  });

  it("ignores case, spaces and dashes", () => {
    assert.equal(normaliseBadgeCode("dfy-ab3cd-9xyz2"), "DFY-AB3CD-9XYZ2");
    assert.equal(normaliseBadgeCode(" dfy ab3cd 9xyz2 "), "DFY-AB3CD-9XYZ2");
    assert.equal(normaliseBadgeCode("DFYAB3CD9XYZ2"), "DFY-AB3CD-9XYZ2");
    assert.equal(normaliseBadgeCode("AB3CD-9XYZ2"), "DFY-AB3CD-9XYZ2");
  });

  it("reads the letters Crockford leaves out as their look-alikes", () => {
    // O → 0, I and L → 1: what someone squinting at a screen types.
    assert.equal(normaliseBadgeCode("DFY-ABOCD-IXYL2"), "DFY-AB0CD-1XY12");
  });

  it("rejects the wrong length", () => {
    assert.equal(normaliseBadgeCode("DFY-AB3CD-9XYZ"), null);
    assert.equal(normaliseBadgeCode("DFY-AB3CD-9XYZ22"), null);
    assert.equal(normaliseBadgeCode(""), null);
  });

  it("rejects characters no badge contains", () => {
    // U is not in the alphabet and has no look-alike rule.
    assert.equal(normaliseBadgeCode("DFY-AB3CD-9XYU2"), null);
    assert.equal(normaliseBadgeCode("DFY-AB3CD-9XY#2"), null);
  });

  it("rejects QR codes that are not badges", () => {
    assert.equal(normaliseBadgeCode("https://devfest.gdgyaounde.com"), null);
    assert.equal(normaliseBadgeCode("WIFI:S:venue;T:WPA;P:secret;;"), null);
  });

  it("only ever returns codes the strict pattern accepts", () => {
    for (const input of ["dfy-ab3cd-9xyz2", "DFYOOOOOIIIII", "llll1-00000"]) {
      const code = normaliseBadgeCode(input);
      if (code) assert.match(code, BADGE_CODE_RE);
    }
  });
});

describe("refundStanding", () => {
  it("is null with nothing on file, or only denied requests", () => {
    assert.equal(refundStanding([]), null);
    assert.equal(refundStanding(["denied"]), null);
    assert.equal(refundStanding(["denied", "denied"]), null);
  });

  it("is pending while a request is open", () => {
    assert.equal(refundStanding(["requested"]), "pending");
    assert.equal(refundStanding(["in_progress"]), "pending");
    assert.equal(refundStanding(["denied", "requested"]), "pending");
  });

  it("is refunded once the money went back — and that wins", () => {
    assert.equal(refundStanding(["resolved"]), "refunded");
    assert.equal(refundStanding(["requested", "resolved"]), "refunded");
    assert.equal(refundStanding(["resolved", "denied"]), "refunded");
  });
});
