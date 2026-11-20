/**
 * The offline backup list (ADR 0090): search and expiry run on the phone, so
 * they are pure and tested here. Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  backupExpired,
  searchBackup,
  type BackupList,
} from "@/lib/staff/backup-list";

const list: BackupList = {
  generatedAt: "2026-11-20T10:00:00Z",
  expiresAt: "2026-11-22T22:59:00Z",
  tiers: { sonnet: { name: "SONNET", paid: true } },
  tickets: [
    { n: "Noémie Youbissi", t: "sonnet", c: "DFY-ABCDE-12345", i: false },
    { n: "Egbe Michel", t: "sonnet", c: "DFY-ZZZZZ-98765", i: true, f: "r" },
  ],
  reservations: [
    {
      r: "RES-K3M9PQ",
      n: "Ada Fotso",
      s: "reserved",
      x: 5000,
      l: ["Sonnet · Ada Fotso"],
      i: false,
    },
  ],
};

describe("searching the saved list", () => {
  it("finds by part of a name, ignoring accents and case", () => {
    assert.deepEqual(
      searchBackup(list, "noemie").tickets.map((t) => t.c),
      ["DFY-ABCDE-12345"],
    );
    assert.deepEqual(
      searchBackup(list, "YOUB").tickets.map((t) => t.n),
      ["Noémie Youbissi"],
    );
  });

  it("finds by ticket code the way the door reads it", () => {
    assert.equal(searchBackup(list, "dfy abcde 12345").tickets.length, 1);
    // O→0, I/L→1 slips a tired volunteer makes
    assert.equal(
      searchBackup(list, "DFY-ZZZZZ-98765").tickets[0].n,
      "Egbe Michel",
    );
  });

  it("finds a reservation by reference or name", () => {
    assert.equal(searchBackup(list, "RES-K3M9PQ").reservations.length, 1);
    assert.equal(searchBackup(list, "ada").reservations.length, 1);
  });

  it("needs two characters and returns nothing otherwise", () => {
    assert.deepEqual(searchBackup(list, "n"), {
      tickets: [],
      reservations: [],
    });
    assert.deepEqual(searchBackup(list, ""), { tickets: [], reservations: [] });
  });

  it("carries no email or phone field at all", () => {
    for (const t of list.tickets)
      assert.deepEqual(
        Object.keys(t).filter((k) => /mail|phone|tel/i.test(k)),
        [],
      );
    for (const r of list.reservations)
      assert.deepEqual(
        Object.keys(r).filter((k) => /mail|phone|tel/i.test(k)),
        [],
      );
  });
});

describe("a copy's expiry", () => {
  it("is valid before the end and dropped at and after it", () => {
    const end = Date.parse(list.expiresAt);
    assert.equal(backupExpired(list, end - 1), false);
    assert.equal(backupExpired(list, end), true);
    assert.equal(backupExpired(list, end + 86_400_000), true);
  });

  it("treats an unreadable date as expired — never kept by accident", () => {
    assert.equal(backupExpired({ expiresAt: "nope" }), true);
  });
});
