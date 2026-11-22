/**
 * Bevy check-ins for the pitch vote (ADR 0099, migration 0047): the email
 * key, the CSV reader, and the SQL it produces. That the TypeScript key and
 * the SQL key agree is proved in tests/db/pitch-votes.db.ts.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  bevyCheckinsSql,
  parseCsv,
  readBevyCheckins,
} from "@/lib/bevy-checkins";
import { canonicalEmail, emailKey } from "@/lib/email-key";

describe("canonicalEmail", () => {
  it("lower-cases and trims", () => {
    assert.equal(canonicalEmail("  Ada@Example.CM "), "ada@example.cm");
  });

  it("drops dots and +tags for Gmail only", () => {
    assert.equal(canonicalEmail("J.Doe+devfest@Gmail.com"), "jdoe@gmail.com");
    assert.equal(canonicalEmail("j.doe@googlemail.com"), "jdoe@gmail.com");
    assert.equal(canonicalEmail("j.doe+x@uy1.cm"), "j.doe+x@uy1.cm");
  });

  it("refuses what isn't an email", () => {
    for (const bad of ["", "nope", "a@b@c", "a b@c.d", null, undefined]) {
      assert.equal(canonicalEmail(bad), null, String(bad));
    }
  });
});

describe("emailKey", () => {
  it("is a SHA-256 hex of the canonical email, the same for every spelling", () => {
    const key = emailKey("jdoe@gmail.com");
    assert.match(key ?? "", /^[0-9a-f]{64}$/);
    assert.equal(emailKey(" J.DOE+vote@gmail.com"), key);
    assert.notEqual(emailKey("jdoe@uy1.cm"), key);
  });
});

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and newlines in fields, CRLF and a BOM", () => {
    const csv =
      '﻿Name,Note\r\n"Doe, Jane","said ""hi""\nthen left"\r\nBob,\r\n\r\n';
    assert.deepEqual(parseCsv(csv), [
      ["Name", "Note"],
      ["Doe, Jane", 'said "hi"\nthen left'],
      ["Bob", ""],
    ]);
  });
});

const HEADER = "Order number,First Name,Email,Checkin Date (UTC)";

describe("readBevyCheckins", () => {
  it("keeps only checked-in rows, one key per email, counting people", () => {
    const data = readBevyCheckins(
      [
        HEADER,
        "1,Ann,ann@gmail.com,2026-11-21 08:00",
        "2,Ann's friend,A.NN@gmail.com,2026-11-21 08:01",
        "3,Ben,ben@uy1.cm,",
        "4,Cy,not-an-email,2026-11-21 09:00",
      ].join("\n"),
    );
    assert.equal(data.rows, 4);
    assert.equal(data.checkedIn, 3);
    assert.equal(data.skipped, 1);
    assert.equal(data.masked, 0);
    assert.deepEqual([...data.keys.entries()], [[emailKey("ann@gmail.com"), 2]]);
  });

  it("counts masked emails and never keys them", () => {
    const data = readBevyCheckins(
      [HEADER, "1,Ann,a**@gmail.com,2026-11-21 08:00"].join("\n"),
    );
    assert.equal(data.masked, 1);
    assert.equal(data.keys.size, 0);
  });

  it("says which columns it expected when they are missing", () => {
    assert.throws(() => readBevyCheckins("Name,Mail\nx,y"), /Checkin Date/);
  });
});

describe("bevyCheckinsSql", () => {
  it("replaces the table in one transaction, with keys only", () => {
    const data = readBevyCheckins(
      [HEADER, "1,Ann,ann@gmail.com,2026-11-21 08:00"].join("\n"),
    );
    const sql = bevyCheckinsSql(data, "export.csv");
    assert.match(sql, /^-- Bevy check-ins/);
    assert.match(sql, /begin;\ndelete from public\.bevy_checkins;\ninsert into/);
    assert.match(sql, new RegExp(`\\('${emailKey("ann@gmail.com")}', 1\\);`));
    assert.match(sql, /commit;\n$/);
    assert.doesNotMatch(sql, /@/);
    assert.doesNotMatch(sql, /Ann/);
  });
});
