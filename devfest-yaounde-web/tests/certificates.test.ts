/**
 * Event certificates (ADR 0100): ids, the issue request, the shared secret,
 * the verify URL, and the "who gets one" list. The table is proved in
 * tests/db/certificates.db.ts.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildCertificateList, tidyName } from "@/lib/certificates/list";
import {
  bearerMatches,
  isCertificateId,
  issueSchema,
  normaliseCertificateId,
  verifyUrl,
} from "@/lib/certificates/rules";

describe("certificate ids", () => {
  it("accepts an edition prefix, a dash and a running number", () => {
    for (const id of ["DFY26-0042", "DFY27-001", "GDGYAOUNDE-123456"]) {
      assert.equal(isCertificateId(id), true, id);
    }
  });

  it("refuses anything else", () => {
    for (const id of [
      "dfy26-0042",
      "DFY26-42",
      "26-0042",
      "DFY26_0042",
      "DFY26-0042 ",
      "",
      null,
    ]) {
      assert.equal(isCertificateId(id), false, String(id));
    }
  });

  it("normalises what was typed or scanned", () => {
    assert.equal(normaliseCertificateId(" dfy26-0042 "), "DFY26-0042");
    assert.equal(normaliseCertificateId("dfy26%2D0042"), "DFY26-0042");
  });
});

describe("the issue request", () => {
  const one = {
    id: "DFY26-0001",
    edition: 2026,
    fullName: "Ada Lovelace",
    role: "speaker",
    detail: "Talk",
  };

  it("accepts a batch of certificates", () => {
    assert.equal(issueSchema.safeParse({ certificates: [one] }).success, true);
  });

  it("has no place for an email, or anything unexpected", () => {
    for (const body of [
      { certificates: [{ ...one, email: "ada@example.com" }] },
      { certificates: [one], extra: true },
      { certificates: [] },
      { certificates: [{ ...one, role: "vip" }] },
      { certificates: [{ ...one, id: "bad" }] },
      { certificates: [{ ...one, fullName: "  " }] },
      {
        certificates: Array.from({ length: 201 }, (_, i) => ({
          ...one,
          id: `DFY26-${String(i).padStart(4, "0")}`,
        })),
      },
    ]) {
      assert.equal(
        issueSchema.safeParse(body).success,
        false,
        JSON.stringify(body).slice(0, 80),
      );
    }
  });
});

describe("the shared secret", () => {
  it("matches only the exact bearer token", () => {
    assert.equal(bearerMatches("Bearer s3cret", "s3cret"), true);
    assert.equal(bearerMatches("Bearer s3cret ", "s3cret"), false);
    assert.equal(bearerMatches("bearer s3cret", "s3cret"), false);
    assert.equal(bearerMatches("Bearer s3cre", "s3cret"), false);
    assert.equal(bearerMatches(null, "s3cret"), false);
    // No secret configured: nothing ever matches.
    assert.equal(bearerMatches("Bearer ", ""), false);
  });
});

describe("the verify URL", () => {
  it("has no locale, so the visitor's language is picked", () => {
    assert.equal(
      verifyUrl("DFY26-0042", "https://devfest.example/"),
      "https://devfest.example/certificates/DFY26-0042",
    );
  });
});

describe("tidyName", () => {
  it("title-cases a name typed all in capitals or lower case, and leaves mixed case alone", () => {
    assert.equal(tidyName("  JEAN-PAUL  N'DIAYE "), "Jean-Paul N'Diaye");
    assert.equal(tidyName("éloïse mbarga"), "Éloïse Mbarga");
    assert.equal(tidyName("Ada McLovelace"), "Ada McLovelace");
  });
});

describe("buildCertificateList", () => {
  const rows = buildCertificateList({
    tickets: [
      {
        attendee_name: "ANN DOE",
        attendee_email: "Ann@Example.cm",
        checked_in_at: "2026-11-21T08:00Z",
      },
      {
        attendee_name: "Ann Doe",
        attendee_email: "ann@example.cm",
        checked_in_at: "2026-11-21T08:05Z",
      },
      {
        attendee_name: "No Show",
        attendee_email: "no@example.cm",
        checked_in_at: null,
      },
    ],
    reservations: [
      {
        contact_name: "Ben",
        contact_email: "ben@example.cm",
        status: "cash_received",
        checked_in_at: "2026-11-21T09:00Z",
      },
      {
        contact_name: "Gone",
        contact_email: "gone@example.cm",
        status: "cancelled",
        checked_in_at: "2026-11-21T09:00Z",
      },
    ],
    volunteers: [{ name: "Ann Doe", email: "ann@example.cm" }],
    speakers: [
      {
        name: "Sam Speaker",
        arrived: true,
        sessionTitles: ["AI at scale", "Workshop"],
      },
      { name: "Away Speaker", arrived: false, sessionTitles: ["x"] },
    ],
    team: [{ name: "Olga Org", role: "Lead" }],
  });

  it("keeps only people who were there, once per role", () => {
    assert.deepEqual(
      rows.map((r) => [r.role, r.full_name, r.email, r.source]),
      [
        ["organiser", "Olga Org", "", "team"],
        ["speaker", "Sam Speaker", "", "speaker"],
        ["volunteer", "Ann Doe", "ann@example.cm", "volunteer"],
        ["attendee", "Ann Doe", "ann@example.cm", "ticket"],
        ["attendee", "Ben", "ben@example.cm", "reservation"],
      ],
    );
  });

  it("carries the speaker's sessions and the organiser's role as the detail", () => {
    assert.equal(
      rows.find((r) => r.role === "speaker")?.detail,
      "AI at scale · Workshop",
    );
    assert.equal(rows.find((r) => r.role === "organiser")?.detail, "Lead");
  });
});
