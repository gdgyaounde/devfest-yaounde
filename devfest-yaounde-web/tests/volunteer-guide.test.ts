/**
 * The volunteer guide's copy (ADR 0089): both languages carry the same
 * sections, steps and notes, so neither is ever half-translated.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (l: string) =>
  JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).staff;

type Section = {
  title: string;
  intro?: string;
  steps?: Record<string, string>;
  tip?: string;
  warn?: string;
};

describe("the volunteer guide copy", () => {
  const en = load("en");
  const fr = load("fr");

  it("has the same sections in both languages, in the same shape", () => {
    const shape = (g: Record<string, Section>) =>
      Object.fromEntries(
        Object.entries(g).map(([k, s]) => [
          k,
          [
            Boolean(s.title),
            Boolean(s.intro),
            Object.keys(s.steps ?? {}).join(""),
            Boolean(s.tip),
            Boolean(s.warn),
          ],
        ]),
      );
    assert.deepEqual(shape(en.guide.sections), shape(fr.guide.sections));
    assert.ok(Object.keys(en.guide.sections).length >= 8);
  });

  it("never leaves an empty line", () => {
    for (const lang of [en, fr]) {
      for (const s of Object.values(lang.guide.sections) as Section[]) {
        for (const text of [
          s.title,
          s.intro,
          s.tip,
          s.warn,
          ...Object.values(s.steps ?? {}),
        ]) {
          if (text !== undefined) assert.ok(text.trim().length > 3);
        }
      }
    }
  });

  it("has the hub tiles and the team page in both languages", () => {
    for (const lang of [en, fr]) {
      for (const k of [
        "guideTile",
        "guideTileBody",
        "teamTile",
        "teamTileBody",
      ]) {
        assert.ok(lang.hub[k], k);
      }
      for (const k of [
        "title",
        "intro",
        "organisers",
        "volunteers",
        "you",
        "empty",
        "count",
      ]) {
        assert.ok(lang.team[k], k);
      }
    }
  });
});
