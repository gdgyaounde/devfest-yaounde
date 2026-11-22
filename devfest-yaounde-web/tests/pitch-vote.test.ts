/**
 * The pitch contest public vote (ADR 0099): the ballot, the window, request
 * validation, and turning a tally into a ranking. Who may vote is decided in
 * the database (tests/db/pitch-votes.db.ts).
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isMissingVoteSchema,
  parseVoteStats,
  PITCH_PROJECTS,
  rankTally,
  voteClosesAt,
  voteOpen,
  voteSchema,
} from "@/lib/pitch-vote";

describe("the ballot", () => {
  it("has the seven pitches, in pitch order, with unique ids", () => {
    assert.deepEqual(
      PITCH_PROJECTS.map((p) => p.id),
      [
        "finfree",
        "agrisense",
        "safeme",
        "holaride",
        "divinelink",
        "transax",
        "tchuekam-agent",
      ],
    );
  });

  it("gives every project a tagline in both languages and safe links", () => {
    for (const p of PITCH_PROJECTS) {
      assert.ok(p.tagline.fr.trim() && p.tagline.en.trim(), p.id);
      assert.ok(p.pitch.trim(), p.id);
      if (p.url) assert.match(p.url, /^https:\/\//, p.id);
      // Ids must pass the database's own check constraint.
      assert.match(p.id, /^[a-z0-9-]{1,40}$/);
    }
  });
});

describe("the window", () => {
  it("closes on Tuesday 24 November 2026 at 23:59 in Yaoundé", () => {
    assert.equal(voteClosesAt().toISOString(), "2026-11-24T22:59:00.000Z");
  });

  it("is open up to the closing instant, exclusive", () => {
    const at = voteClosesAt();
    assert.equal(voteOpen(new Date(at.getTime() - 1), at), true);
    assert.equal(voteOpen(at, at), false);
    assert.equal(voteOpen(new Date(at.getTime() + 1), at), false);
  });
});

describe("a vote request", () => {
  it("accepts a project on the ballot", () => {
    assert.equal(voteSchema.safeParse({ projectId: "safeme" }).success, true);
  });

  it("refuses anything else", () => {
    for (const body of [
      {},
      { projectId: "not-a-project" },
      { projectId: "SAFEME" },
      { projectId: "safeme", userId: "someone-else" },
      { projectId: ["safeme"] },
    ]) {
      assert.equal(voteSchema.safeParse(body).success, false, JSON.stringify(body));
    }
  });
});

describe("rankTally", () => {
  const ballot = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("ranks by votes, lists every project, and shares ranks on ties", () => {
    const r = rankTally({ c: 5, a: 2, b: 5 }, ballot);
    assert.deepEqual(
      r.map((x) => [x.id, x.votes, x.rank]),
      [
        ["b", 5, 1],
        ["c", 5, 1],
        ["a", 2, 3],
        ["d", 0, 4],
      ],
    );
  });

  it("works out whole-number shares, and 0 % when nobody voted", () => {
    assert.deepEqual(
      rankTally({ a: 1, b: 2 }, ballot).map((x) => x.percent),
      [67, 33, 0, 0],
    );
    assert.deepEqual(
      rankTally({}, ballot).map((x) => [x.percent, x.rank]),
      [
        [0, 1],
        [0, 1],
        [0, 1],
        [0, 1],
      ],
    );
  });

  it("ignores projects no longer on the ballot and junk counts", () => {
    const r = rankTally(
      { a: 3, gone: 50, b: -4, c: Number.NaN } as Record<string, number>,
      ballot,
    );
    assert.deepEqual(
      r.map((x) => [x.id, x.votes, x.percent]),
      [
        ["a", 3, 100],
        ["b", 0, 0],
        ["c", 0, 0],
        ["d", 0, 0],
      ],
    );
  });
});

describe("parseVoteStats", () => {
  it("reads what pitch_vote_stats returns, and nothing it shouldn't", () => {
    assert.deepEqual(
      parseVoteStats({ eligible: 27, voted: 3, tally: { a: 2, b: "x" } }),
      { eligible: 27, voted: 3, tally: { a: 2 } },
    );
    assert.equal(parseVoteStats(null), null);
  });
});

describe("isMissingVoteSchema", () => {
  it("recognises 'migration not applied' and nothing else", () => {
    assert.equal(isMissingVoteSchema({ code: "PGRST202" }), true);
    assert.equal(
      isMissingVoteSchema({ message: 'relation "pitch_votes" does not exist' }),
      true,
    );
    assert.equal(isMissingVoteSchema({ code: "23505", message: "dup" }), false);
  });
});
