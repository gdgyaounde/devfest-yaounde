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

  it("is going on now: Egbe (R1), Marie (R2), Folong (R3)", () => {
    assert.deepEqual(rows("now"), [
      ["Egbe Michel", "Room 1"],
      ["Marie Ipouk", "Room 2"],
      ["Emerson Folong", "Room 3"],
    ]);
  });

  it("is coming up next: Naomy (R1), Linda (R2), Raïssa (R3)", () => {
    assert.deepEqual(rows("next"), [
      ["Ange Naomy Kengne Takoumbo", "Room 1"],
      ["Linda Ebete", "Room 2"],
      ["Raïssa Wokmeni", "Room 3"],
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
