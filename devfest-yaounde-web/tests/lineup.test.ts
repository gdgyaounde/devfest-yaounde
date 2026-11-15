/**
 * The 2026 lineup (ADR 0073): the daily home spotlight, unscheduled
 * sessions, the published data and the migration that carries it live.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import speakersJson from "@/data/speakers.json";
import sessionsJson from "@/data/sessions.json";
import type { Session, Speaker } from "@/data/types";
import { collectionSchemas } from "@/lib/content/schemas";
import { revalidationPaths } from "@/lib/content/revalidate";
import {
  groupProgramme,
  hasCalendarSlot,
  hasText,
  isScheduled,
} from "@/lib/sessions";
import {
  SPOTLIGHT_SIZE,
  pickSpotlight,
  spotlightDateKey,
} from "@/lib/spotlight";

const speakers = speakersJson as Speaker[];
const sessions = sessionsJson as Session[];

const people = (n: number, featured: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${String(i).padStart(2, "0")}`,
    ...(featured.includes(i) ? { featured: true } : {}),
  }));

const ids = (list: { id: string }[]) => list.map((p) => p.id);

/** "2026-11-01" + n days, as a date key. */
const day = (n: number) =>
  new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);

describe("the daily speaker spotlight", () => {
  it("gives everyone the same picks on the same date", () => {
    const list = people(24);
    assert.deepEqual(
      ids(pickSpotlight(list, "2026-11-16")),
      ids(pickSpotlight([...list].reverse(), "2026-11-16")),
      "order of the stored list must not matter",
    );
  });

  it("changes from one day to the next", () => {
    const list = people(24);
    assert.notDeepEqual(
      ids(pickSpotlight(list, "2026-11-16")),
      ids(pickSpotlight(list, "2026-11-17")),
    );
  });

  it("never repeats a speaker within a day, and fills the reel", () => {
    for (let d = 0; d < 30; d++) {
      const picks = ids(pickSpotlight(people(24), day(d)));
      assert.equal(picks.length, SPOTLIGHT_SIZE);
      assert.equal(new Set(picks).size, picks.length);
    }
  });

  it("is fair: every speaker gets a turn within one cycle", () => {
    // 24 speakers, 6 a day → a 4-day cycle. Days 0..3 of the epoch-aligned
    // cycle that contains 2026-11-16.
    const list = people(24);
    const start = Math.floor(Date.UTC(2026, 10, 16) / 86_400_000);
    const cycleStart = start - (start % 4);
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const key = new Date((cycleStart + i) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      for (const id of ids(pickSpotlight(list, key))) seen.add(id);
    }
    assert.equal(seen.size, 24);
  });

  it("copes with fewer speakers than slots", () => {
    const picks = ids(pickSpotlight(people(3), "2026-11-16"));
    assert.equal(picks.length, 3);
    assert.equal(new Set(picks).size, 3);
    assert.deepEqual(pickSpotlight([], "2026-11-16"), []);
  });

  it("pins featured speakers first, then fills from the rotation", () => {
    const picks = ids(pickSpotlight(people(24, [5, 9]), "2026-11-16"));
    assert.deepEqual(picks.slice(0, 2), ["p05", "p09"]);
    assert.equal(picks.length, SPOTLIGHT_SIZE);
    assert.equal(new Set(picks).size, SPOTLIGHT_SIZE);
  });

  it("rotates at midnight in Yaoundé, not UTC", () => {
    // 23:30 UTC on the 20th is 00:30 on the 21st in Yaoundé (UTC+1).
    assert.equal(
      spotlightDateKey(new Date("2026-11-20T23:30:00Z")),
      "2026-11-21",
    );
    assert.equal(
      spotlightDateKey(new Date("2026-11-20T22:30:00Z")),
      "2026-11-20",
    );
  });
});

describe("unscheduled sessions (ADR 0073)", () => {
  const base: Session = {
    id: "x",
    day: 1,
    kind: "talk",
    title: { fr: "t", en: "t" },
    description: { fr: "", en: "" },
    track: { fr: "Web", en: "Web" },
    tags: [],
    speakerIds: [],
  };

  it("needs a start time to be on the timeline", () => {
    assert.equal(isScheduled(base), false);
    assert.equal(isScheduled({ ...base, time: "09:30" }), true);
  });

  it("needs a start AND a length for add-to-calendar", () => {
    assert.equal(hasCalendarSlot({ ...base, time: "09:30" }), false);
    assert.equal(
      hasCalendarSlot({ ...base, time: "09:30", durationMin: 10 }),
      true,
    );
  });

  it("groups workshops, then lightning talks, then other talks", () => {
    const groups = groupProgramme([
      { ...base, id: "a", lightning: true },
      { ...base, id: "b", kind: "workshop" },
      { ...base, id: "c" },
      { ...base, id: "d", lightning: true },
    ]);
    assert.deepEqual(
      groups.map((g) => [g.group, ids(g.sessions)]),
      [
        ["workshop", ["b"]],
        ["lightning", ["a", "d"]],
        ["other", ["c"]],
      ],
    );
  });

  it("caps each group for the preview but keeps the true total", () => {
    const groups = groupProgramme(
      Array.from({ length: 5 }, (_, i) => ({
        ...base,
        id: `l${i}`,
        lightning: true,
      })),
      3,
    );
    assert.equal(groups[0].sessions.length, 3);
    assert.equal(groups[0].total, 5);
  });

  it("treats a blank or '—' placeholder as no text", () => {
    assert.equal(hasText({ fr: "—", en: "—" }, "fr"), false);
    assert.equal(hasText({ fr: " ", en: "" }, "en"), false);
    assert.equal(hasText(undefined, "fr"), false);
    assert.equal(hasText({ fr: "Oui", en: "Yes" }, "en"), true);
  });
});

describe("the published lineup data", () => {
  it("validates against the collection schemas", () => {
    assert.equal(collectionSchemas.speakers.safeParse(speakers).success, true);
    assert.equal(collectionSchemas.sessions.safeParse(sessions).success, true);
  });

  it("matches the accepted roster: 24 speakers, 24 sessions, 4 workshops", () => {
    assert.equal(speakers.length, 24);
    assert.equal(sessions.length, 24);
    assert.equal(sessions.filter((s) => s.kind === "workshop").length, 4);
    assert.equal(sessions.filter((s) => s.lightning).length, 20);
  });

  it("marks Hubert Nang's session — and only his — as online", () => {
    const online = sessions.filter((s) => s.online);
    assert.deepEqual(
      online.map((s) => s.speakerIds),
      [["hubert-nang"]],
    );
  });

  it("schedules nothing it was not given", () => {
    for (const s of sessions) {
      assert.equal(s.time, undefined, s.id);
      assert.equal(s.room, undefined, s.id);
      assert.equal(s.durationMin, undefined, s.id);
    }
  });

  it("links every speaker and session both ways", () => {
    const sessionIds = new Set(sessions.map((s) => s.id));
    const speakerIds = new Set(speakers.map((s) => s.id));
    for (const sp of speakers) {
      for (const id of sp.sessionIds) assert.ok(sessionIds.has(id), id);
    }
    for (const s of sessions) {
      for (const id of s.speakerIds) assert.ok(speakerIds.has(id), id);
    }
  });

  it("has a committed photo for every speaker", () => {
    for (const sp of speakers) {
      assert.match(sp.photoUrl, /^\/speakers\/[a-z0-9-]+\.webp$/);
      assert.ok(
        existsSync(join(process.cwd(), "public", sp.photoUrl)),
        sp.photoUrl,
      );
    }
  });

  it("carries no private export fields", () => {
    const text = JSON.stringify([speakers, sessions]);
    assert.doesNotMatch(text, /@[a-z0-9-]+\.(com|cm|fr|org)\b/i);
    assert.doesNotMatch(text, /\+237|\b6[5-9]\d{7}\b/);
    for (const sp of speakers) {
      for (const key of Object.keys(sp)) {
        assert.doesNotMatch(key, /email|phone|residence|shirt|owner/i);
      }
    }
  });
});

describe("the lineup migration (0030)", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/0030_publish_lineup_2026.sql"),
    "utf8",
  );
  const payloads = [...sql.matchAll(/\$lineup\$([\s\S]*?)\$lineup\$/g)].map(
    (m) => JSON.parse(m[1]),
  );

  it("carries exactly the two collections, valid, and the same records", () => {
    assert.equal(payloads.length, 2);
    const [sp, se] = payloads;
    assert.equal(collectionSchemas.speakers.safeParse(sp).success, true);
    assert.equal(collectionSchemas.sessions.safeParse(se).success, true);
    assert.deepEqual(ids(sp), ids(speakers));
    assert.deepEqual(ids(se), ids(sessions));
  });

  it("refuses to overwrite hand-entered rows", () => {
    assert.match(sql, /raise exception/);
    assert.match(sql, /editorial_migration_backup/);
  });
});

describe("saving speakers or sessions refreshes every page that shows them", () => {
  const all = [
    "/fr",
    "/en",
    "/fr/speakers",
    "/en/speakers",
    "/fr/schedule",
    "/en/schedule",
  ];
  it("speakers → home, /speakers, /schedule, both locales", () => {
    for (const p of all)
      assert.ok(revalidationPaths("speakers").includes(p), p);
  });
  it("sessions → /schedule, home, /speakers, both locales", () => {
    for (const p of all)
      assert.ok(revalidationPaths("sessions").includes(p), p);
  });
});
