import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sessionsJson from "@/data/sessions.json";
import speakersJson from "@/data/speakers.json";
import { resolveUpNext, upNextEntries } from "@/lib/up-next";
import type { Session, Speaker } from "@/data/types";

const sessions = sessionsJson as unknown as Session[];
const speakers = speakersJson as unknown as Speaker[];
const rows = (row: "now" | "next") =>
  resolveUpNext(upNextEntries(row), sessions, speakers).map((i) => [
    i.speakers[0]?.name,
    i.room?.en,
  ]);

describe("the Going on now / Coming up next rows (ADR 0097)", () => {
  it("points only at live sessions that exist", () => {
    for (const row of ["now", "next"] as const) {
      assert.equal(
        resolveUpNext(upNextEntries(row), sessions, speakers).length,
        upNextEntries(row).length,
      );
    }
  });

  it("is going on now: Hubert (R1), Anita (R2), Manuel (R3)", () => {
    assert.deepEqual(rows("now"), [
      ["Hubert Nang", "Room 1"],
      ["Anita Dongmo", "Room 2"],
      ["Manuel Karim Abolo", "Room 3"],
    ]);
  });

  it("is coming up next: Dachi (R1), Egbe (R2), Marie (R3)", () => {
    assert.deepEqual(rows("next"), [
      ["Le Prince Dachi", "Room 1"],
      ["Egbe Michel", "Room 2"],
      ["Marie Ipouk", "Room 3"],
    ]);
  });

  it("skips unknown and hidden sessions instead of failing", () => {
    const hidden = sessions.find((s) => s.hidden)!;
    assert.equal(
      resolveUpNext(
        [{ sessionId: "nope" }, { sessionId: hidden.id }],
        sessions,
        speakers,
      ).length,
      0,
    );
  });

  it("never edits the programme it sits above", () => {
    const before = JSON.stringify(sessions);
    resolveUpNext(upNextEntries("now"), sessions, speakers);
    assert.equal(JSON.stringify(sessions), before);
  });
});
