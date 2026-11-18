/**
 * "This interests me" (ADR 0086): the pure rules. Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  interestRows,
  interestSchema,
  knownSession,
  MAX_INTERESTS,
} from "@/lib/interests/rules";

const sessions = [
  { id: "a", time: "09:20", title: { fr: "A fr", en: "A en" } },
  { id: "b", time: "10:00", title: { fr: "B fr", en: "B en" } },
  { id: "c", title: { fr: "C fr", en: "" } },
];

describe("the interest request", () => {
  it("accepts a session id and a boolean, and nothing else", () => {
    assert.equal(
      interestSchema.safeParse({ sessionId: "a", interested: true }).success,
      true,
    );
    assert.equal(
      interestSchema.safeParse({ sessionId: "a", interested: "yes" }).success,
      false,
    );
    assert.equal(
      interestSchema.safeParse({ sessionId: "", interested: true }).success,
      false,
    );
    assert.equal(
      interestSchema.safeParse({
        sessionId: "a",
        interested: true,
        userId: "someone-else",
      }).success,
      false,
      "a caller-supplied user id must be rejected, not ignored",
    );
  });

  it("only marks sessions that exist on the schedule", () => {
    assert.equal(knownSession("a", sessions), true);
    assert.equal(knownSession("zzz", sessions), false);
  });

  it("caps an account", () => {
    assert.ok(MAX_INTERESTS >= 40 && MAX_INTERESTS <= 100);
  });
});

describe("the admin interest numbers", () => {
  it("sorts by interest, joins titles, drops zeros, and carries no user data", () => {
    const rows = interestRows(
      [
        { session_id: "b", interested: 5 },
        { session_id: "a", interested: 9 },
        { session_id: "c", interested: 0 },
        { session_id: "gone", interested: 2 },
      ],
      sessions,
    );
    assert.deepEqual(
      rows.map((r) => [r.sessionId, r.title, r.interested]),
      [
        ["a", "A en", 9],
        ["b", "B en", 5],
        ["gone", "gone", 2],
      ],
    );
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), [
        "interested",
        "sessionId",
        "time",
        "title",
      ]);
    }
  });
});
