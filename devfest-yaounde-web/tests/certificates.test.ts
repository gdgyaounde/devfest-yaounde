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
  it("accepts an edition prefix and a random Crockford key", () => {
    for (const id of ["DFY26-K7QM-4XHT", "DFY27-0000-ZZZZ", "GDGYAOUNDE-AB12-CD34"]) {
      assert.equal(isCertificateId(id), true, id);
    }
  });

  it("refuses running numbers, ambiguous letters and anything else", () => {
    for (const id of [
      "DFY26-0042",
      "dfy26-k7qm-4xht",
      "DFY26-K7QM4XHT",
      "DFY26-K7QM-4XH",
      "DFY26-K7QM-4XHTT",
      "DFY26-K7QO-4XHT",
      "DFY26-K7QI-4XHT",
      "DFY26-K7QU-4XHT",
      "26-K7QM-4XHT",
      "DFY26-K7QM-4XHT ",
      "",
      null,
    ]) {
      assert.equal(isCertificateId(id), false, String(id));
    }
  });

  it("normalises what was typed or scanned", () => {
    assert.equal(normaliseCertificateId(" dfy26-k7qm-4xht "), "DFY26-K7QM-4XHT");
    assert.equal(normaliseCertificateId("dfy26%2Dk7qm-4xht"), "DFY26-K7QM-4XHT");
    // O, I and L in the key are read as 0 and 1; the prefix is left alone.
    assert.equal(normaliseCertificateId("DFYOI-KOQL-4XHI"), "DFYOI-K0Q1-4XH1");
  });
});

describe("the issue request", () => {
  const one = {
    id: "DFY26-K7QM-4XHT",
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
      verifyUrl("DFY26-K7QM-4XHT", "https://devfest.example/"),
      "https://devfest.example/certificates/DFY26-K7QM-4XHT",
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
        tier_id: "haikyu",
      },
      {
        attendee_name: "Ann Doe",
        attendee_email: "ann@example.cm",
        checked_in_at: "2026-11-21T08:05Z",
        tier_id: "sonnet",
      },
      {
        attendee_name: "No Show",
        attendee_email: "no@example.cm",
        checked_in_at: null,
        tier_id: "opus",
      },
      {
        attendee_name: "Fay Free",
        attendee_email: "fay@example.cm",
        checked_in_at: "2026-11-21T08:10Z",
        tier_id: "haikyu",
      },
      {
        attendee_name: "Gus Gone Tier",
        attendee_email: "gus@example.cm",
        checked_in_at: "2026-11-21T08:10Z",
        tier_id: "retired",
      },
    ],
    tierPrices: { haikyu: 0, sonnet: 2000, opus: 5000 },
    reservations: [
      {
        contact_name: "Ben",
        contact_email: "ben@example.cm",
        status: "cash_received",
        checked_in_at: "2026-11-21T09:00Z",
        total_xaf: 4000,
      },
      {
        contact_name: "Zoé Zero",
        contact_email: "zoe@example.cm",
        status: "confirmed",
        checked_in_at: "2026-11-21T09:00Z",
        total_xaf: 0,
      },
      {
        contact_name: "Gone",
        contact_email: "gone@example.cm",
        status: "cancelled",
        checked_in_at: "2026-11-21T09:00Z",
        total_xaf: 4000,
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
        ["attendee", "Fay Free", "fay@example.cm", "ticket"],
        ["attendee", "Gus Gone Tier", "gus@example.cm", "ticket"],
        ["attendee", "Zoé Zero", "zoe@example.cm", "reservation"],
      ],
    );
  });

  it("marks attendees paid or free, and leaves other roles blank", () => {
    const ticket = (name: string, role = "attendee") =>
      rows.find((r) => r.full_name === name && r.role === role)?.ticket;
    // Ann held a free AND a paid ticket: one certificate, paid.
    assert.equal(ticket("Ann Doe"), "paid");
    assert.equal(ticket("Ben"), "paid");
    assert.equal(ticket("Fay Free"), "free");
    assert.equal(ticket("Gus Gone Tier"), "free");
    assert.equal(ticket("Zoé Zero"), "free");
    assert.equal(ticket("Ann Doe", "volunteer"), "");
    assert.equal(ticket("Sam Speaker", "speaker"), "");
  });

  it("carries the speaker's sessions and the organiser's role as the detail", () => {
    assert.equal(
      rows.find((r) => r.role === "speaker")?.detail,
      "AI at scale · Workshop",
    );
    assert.equal(rows.find((r) => r.role === "organiser")?.detail, "Lead");
  });
});
