import { describe, it } from "node:test";
import assert from "node:assert/strict";
import speakers from "@/data/speakers.json";
import team from "@/data/team.json";
import sessions from "@/data/sessions.json";
import sponsors from "@/data/sponsors.json";
import faqs from "@/data/faqs.json";
import products from "@/data/products.json";
import tiers from "@/data/ticket-tiers.json";
import quotes from "@/data/quotes.json";
import stats from "@/data/stats.json";
import pastEditions from "@/data/past-editions.json";
import {
  collectionSchemas,
  discountPatchSchema,
  discountWriteSchema,
  firstZodIssue,
  settingsSchema,
} from "@/lib/content/schemas";
import { dryRun, parseCsv } from "@/lib/admin/csv";
import {
  SPEAKER_CSV_SPEC,
  TEAM_CSV_SPEC,
  speakersFromCsv,
  teamFromCsv,
} from "@/lib/content/from-csv";
import {
  endsAt,
  isoToWatLocal,
  slugify,
  watLocalToIso,
} from "@/lib/admin/form-helpers";
import { cfsAcceptsSubmissions, cfsView } from "@/lib/content/cfs";
import {
  SPONSOR_SEATS,
  sponsorCallOpen,
  sponsorSeats,
} from "@/lib/content/sponsors";
import type { Sponsor } from "@/data/types";
import { canOptimise } from "@/lib/images";
import { DESKTOP_ZONES, MOBILE_ZONES, pickStickers } from "@/lib/hero-stickers";
import {
  pickQuoteStickers,
  QUOTE_SLOTS,
  QUOTE_STICKER_POOL,
} from "@/lib/quote-stickers";
import { findSticker } from "@/lib/dp/stickers";
import {
  applyPhotoUrl,
  entryNeedsPhoto,
  isPlaceholderPhoto,
  normalisePhoto,
  PHOTO_CONTENT_TYPE,
} from "@/lib/content/photos";

/**
 * A speaker, built here rather than borrowed from `speakers.json`.
 *
 * These tests used to reach for `speakers[0]` as a convenient fixture. That
 * broke the moment the seed was emptied for the real event — the call for
 * speakers is open, so the file is legitimately `[]`, and TypeScript infers
 * `never[]` from it. A test about schema behaviour should not depend on how
 * much content happens to be seeded.
 */
const A_SPEAKER = {
  id: "ama-nkeng",
  name: "Ama Nkeng",
  role: { fr: "Ingénieure", en: "Engineer" },
  company: "Acme",
  photoUrl: "",
  bio: { fr: "Bio", en: "Bio" },
  track: { fr: "Cloud", en: "Cloud" },
  day: 1,
  sessionIds: [],
  social: {},
  icebreakerQuestion: { fr: "Q", en: "Q" },
  icebreakerAnswer: { fr: "A", en: "A" },
};

describe("editorial schemas", () => {
  it("accept the repo files as they stand", () => {
    const files = {
      speakers,
      team,
      sessions,
      sponsors,
      faqs,
      products,
      "ticket-tiers": tiers,
      quotes,
      stats,
      "past-editions": pastEditions,
    } as const;

    for (const [id, payload] of Object.entries(files)) {
      const parsed =
        collectionSchemas[id as keyof typeof collectionSchemas].safeParse(
          payload,
        );
      assert.equal(
        parsed.success,
        true,
        parsed.success
          ? id
          : `${id}: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
      );
    }
  });

  it("refuses a duplicate speaker id", () => {
    const copy = [A_SPEAKER, A_SPEAKER];
    assert.equal(collectionSchemas.speakers.safeParse(copy).success, false);
  });

  it("accepts a single event date and refuses impossible dates", () => {
    assert.equal(
      settingsSchema.safeParse({ eventDate: "2026-11-21" }).success,
      true,
    );
    for (const eventDate of [
      "",
      "2026-02-30",
      "21/11/2026",
      "2026-11-21T09:00:00Z",
    ]) {
      assert.equal(settingsSchema.safeParse({ eventDate }).success, false);
    }
    assert.equal(settingsSchema.safeParse({ eventDate: null }).success, true);
    assert.equal(
      settingsSchema.safeParse({ hero: { imageUrl: "" } }).success,
      true,
    );
  });

  it("accepts a well-formed percent code, including a string value", () => {
    const parsed = discountWriteSchema.safeParse({
      code: "test10",
      kind: "percent",
      value: "10",
      appliesTo: "both",
      active: true,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.code, "TEST10");
      assert.equal(parsed.data.value, 10);
    }
  });

  it("refuses an empty or short code with a path in the first issue", () => {
    const empty = discountWriteSchema.safeParse({
      code: "",
      kind: "percent",
      value: 10,
    });
    assert.equal(empty.success, false);
    if (!empty.success) {
      assert.match(firstZodIssue(empty.error), /^code:/);
    }
    const short = discountWriteSchema.safeParse({
      code: "AB",
      kind: "percent",
      value: 10,
    });
    assert.equal(short.success, false);
  });

  it("refuses a percent over 100 and an empty value", () => {
    const tooMuch = discountWriteSchema.safeParse({
      code: "TOO-MUCH",
      kind: "percent",
      value: 150,
    });
    assert.equal(tooMuch.success, false);
    if (!tooMuch.success) {
      assert.match(firstZodIssue(tooMuch.error), /percent must be 1–100/);
    }
    const blank = discountWriteSchema.safeParse({
      code: "BLANK",
      kind: "percent",
      value: "",
    });
    assert.equal(blank.success, false);
  });

  it("treats a blank expiry as omitted and still patches active", () => {
    const created = discountWriteSchema.safeParse({
      code: "KEEP",
      kind: "fixed",
      value: 500,
      expiresAt: "",
    });
    assert.equal(created.success, true);
    if (created.success) assert.equal(created.data.expiresAt, null);

    const patched = discountPatchSchema.safeParse({
      active: false,
      code: "KEEP",
    });
    assert.equal(patched.success, true);
    if (patched.success) {
      assert.equal(patched.data.value, undefined);
      assert.equal(patched.data.expiresAt, undefined);
    }
  });

  it("accepts empty announcement strings and https URLs", () => {
    assert.equal(
      settingsSchema.safeParse({
        announcement: { fr: "", en: "Hello" },
        bevyUrl: "https://gdg.community.dev/x",
        legal: { privacyUrl: "https://example.com/privacy", termsUrl: "" },
      }).success,
      true,
    );
  });

  it("accepts the seeded call-for-speakers and sponsor settings", () => {
    const parsed = settingsSchema.safeParse({
      cfs: {
        url: "https://sessionize.com/devfest-yaounde-2026",
        opensAt: "2026-09-05T01:00:00+01:00",
        closesAt: "2026-10-31T23:59:00+01:00",
        override: "auto",
      },
      sponsorCall: {
        prospectusUrl: "https://drive.google.com/file/d/abc/view",
        enabled: true,
        closesAt: null,
      },
      legal: {
        participationTermsUrl: "https://gdg.community.dev/participation-terms/",
        privacyUrl: "https://policies.google.com/privacy",
        termsUrl: "https://policies.google.com/terms",
      },
    });
    assert.equal(parsed.success, true);
  });

  it("refuses a nonsense deadline and an unknown override", () => {
    assert.equal(
      settingsSchema.safeParse({ cfs: { closesAt: "next tuesday" } }).success,
      false,
    );
    assert.equal(
      settingsSchema.safeParse({ cfs: { override: "maybe" } }).success,
      false,
    );
    // A cleared deadline is a real state — the call is open with no end.
    assert.equal(
      settingsSchema.safeParse({ cfs: { closesAt: null } }).success,
      true,
    );
  });

  it("refuses a javascript: URL in every link it accepts", () => {
    const bad = "javascript:alert(1)";
    assert.equal(settingsSchema.safeParse({ bevyUrl: bad }).success, false);
    assert.equal(
      settingsSchema.safeParse({ legal: { privacyUrl: bad } }).success,
      false,
    );
    assert.equal(
      settingsSchema.safeParse({ legal: { participationTermsUrl: bad } })
        .success,
      false,
    );
    assert.equal(
      settingsSchema.safeParse({ cfs: { url: bad } }).success,
      false,
    );
    assert.equal(
      settingsSchema.safeParse({ sponsorCall: { prospectusUrl: bad } }).success,
      false,
    );
  });
});

describe("csv of names, photos later", () => {
  it("builds speakers from a basic sheet and keeps an existing photo", () => {
    const sheet = parseCsv(
      [
        "id,name,role_en,role_fr,company,bio_en,bio_fr,photoUrl",
        "ama-nkeng,Ama Nkeng,Engineer,Ingénieure,Acme,Bio,Bio,",
      ].join("\n"),
    );
    const dry = dryRun(sheet, SPEAKER_CSV_SPEC);
    assert.equal(dry.issues.length, 0);
    const payload = speakersFromCsv(dry, [
      { ...A_SPEAKER, photoUrl: "https://example.com/kept.jpg" },
    ]);
    assert.equal(payload[0].photoUrl, "https://example.com/kept.jpg");
    assert.equal(collectionSchemas.speakers.safeParse(payload).success, true);
  });

  it("does not un-hide somebody by re-importing the sheet", () => {
    // `hidden` is not a CSV column, so a rebuild from the sheet alone would
    // silently put a person back on the public site. Nobody would choose
    // that, and nobody would see it happen.
    const sheet = parseCsv(
      [
        "id,name,role_en,role_fr,company,bio_en,bio_fr,photoUrl",
        "ama-nkeng,Ama Nkeng,Engineer,Ingénieure,Acme,Bio,Bio,",
      ].join("\n"),
    );
    const dry = dryRun(sheet, SPEAKER_CSV_SPEC);
    const payload = speakersFromCsv(dry, [{ ...A_SPEAKER, hidden: true }]);
    assert.equal(payload[0].hidden, true);
  });
});

describe("team card enrichment — tags, tagline, join year", () => {
  const MEMBER = {
    id: "ama-nkeng",
    name: "Ama Nkeng",
    role: { en: "Lead", fr: "Responsable" },
    contribution: { en: "Design", fr: "Design" },
    photoUrl: "",
  };
  const tag = (en: string, fr = en) => ({ en, fr });

  it("accepts a member with none of the new fields — every existing record", () => {
    assert.equal(collectionSchemas.team.safeParse([MEMBER]).success, true);
  });

  it("accepts up to three bilingual tags, a tagline and a join year", () => {
    const row = {
      ...MEMBER,
      oneLiner: {
        en: "Ships Android by day",
        fr: "Livre de l'Android le jour",
      },
      expertise: [
        tag("Frontend"),
        tag("Community", "Communauté"),
        tag("Design"),
      ],
      gdgSince: 2022,
    };
    assert.equal(collectionSchemas.team.safeParse([row]).success, true);
  });

  it("refuses a fourth tag, a blank tag, and an implausible join year", () => {
    const parse = (extra: object) =>
      collectionSchemas.team.safeParse([{ ...MEMBER, ...extra }]).success;
    assert.equal(
      parse({ expertise: [tag("a"), tag("b"), tag("c"), tag("d")] }),
      false,
      "a fourth tag turns the card into a wall of chips",
    );
    assert.equal(parse({ expertise: [tag("")] }), false, "blank tag");
    assert.equal(parse({ expertise: [{ en: "Only EN", fr: "" }] }), false);
    assert.equal(parse({ gdgSince: 1999 }), false);
    assert.equal(parse({ gdgSince: 2022.5 }), false);
    assert.equal(parse({ gdgSince: "2022" as unknown as number }), false);
  });

  it("a CSV re-import keeps the tags and join year an organiser entered", () => {
    // None of these are CSV columns, and the import rebuilds every row —
    // without carrying them over, re-importing the sheet would silently
    // erase them.
    const sheet = parseCsv(
      [
        "id,name,role_en,role_fr,oneLiner_en,oneLiner_fr,contribution_en,contribution_fr,photoUrl",
        "ama-nkeng,Ama Nkeng,Lead,Responsable,Hi,Salut,Design,Design,",
      ].join("\n"),
    );
    const dry = dryRun(sheet, TEAM_CSV_SPEC);
    assert.equal(dry.issues.length, 0);
    const payload = teamFromCsv(dry, [
      { ...MEMBER, expertise: [tag("Frontend")], gdgSince: 2021 },
    ]);
    assert.deepEqual(payload[0].expertise, [tag("Frontend")]);
    assert.equal(payload[0].gdgSince, 2021);
    assert.equal(collectionSchemas.team.safeParse(payload).success, true);
  });
});

describe("hiding somebody without deleting them", () => {
  const visible = <T extends { id: string; hidden?: boolean }>(rows: T[]) =>
    rows.filter((row) => !row.hidden);

  it("keeps a record that is off the site", () => {
    const rows = [
      { ...A_SPEAKER, id: "shown" },
      { ...A_SPEAKER, id: "gone", hidden: true },
    ];
    assert.equal(rows.length, 2);
    assert.deepEqual(
      visible(rows).map((r) => r.id),
      ["shown"],
    );
  });

  it("treats a record with no flag as visible", () => {
    // Every speaker and organiser written before this field existed has no
    // `hidden` key. They must stay on the site.
    assert.equal(visible([{ ...A_SPEAKER }]).length, 1);
    assert.equal(visible([{ ...A_SPEAKER, hidden: false }]).length, 1);
  });

  it("accepts the flag in the stored payload, and its absence", () => {
    assert.equal(
      collectionSchemas.speakers.safeParse([{ ...A_SPEAKER, hidden: true }])
        .success,
      true,
    );
    assert.equal(
      collectionSchemas.speakers.safeParse([A_SPEAKER]).success,
      true,
    );
  });

  it("shows the call for speakers when every speaker is hidden", () => {
    // The public list is what the state machine reads, so a lineup that is
    // entirely hidden is an empty lineup as far as the site is concerned —
    // and an empty lineup is an invitation, not a blank section.
    const all = [
      { ...A_SPEAKER, id: "a", hidden: true },
      { ...A_SPEAKER, id: "b", hidden: true },
    ];
    const view = cfsView(
      {
        url: "https://sessionize.com/devfest-yaounde-2026",
        opensAt: null,
        closesAt: null,
        override: "auto",
      },
      visible(all).length,
    );
    assert.equal(view.state, "open");
  });
});

describe("editorial photos", () => {
  it("treats empty, hash and placeholder paths as missing", () => {
    assert.equal(isPlaceholderPhoto(""), true);
    assert.equal(isPlaceholderPhoto("#"), true);
    assert.equal(isPlaceholderPhoto("/placeholders/speaker-1.svg"), true);
    assert.equal(
      isPlaceholderPhoto(
        "https://x.supabase.co/storage/v1/object/public/editorial/speakers/a.jpg",
      ),
      false,
    );
  });

  it("writes a speaker photo onto photoUrl and a product onto images[0]", () => {
    const speaker = applyPhotoUrl(
      { id: "a", photoUrl: "" },
      { kind: "url", field: "photoUrl" },
      "https://cdn/a.jpg",
    );
    assert.equal(speaker.photoUrl, "https://cdn/a.jpg");
    const product = applyPhotoUrl(
      { id: "tee", images: [] },
      { kind: "images", field: "images" },
      "https://cdn/tee.jpg",
    );
    assert.deepEqual(product.images, ["https://cdn/tee.jpg"]);
    assert.equal(
      entryNeedsPhoto(
        { photoUrl: "/placeholders/x.svg" },
        {
          kind: "url",
          field: "photoUrl",
        },
      ),
      true,
    );
  });
});

describe("the transparent-logo bug — normalisePhoto preserves alpha", () => {
  /*
   * Built with `sharp` directly rather than a checked-in fixture file: a
   * 100×60 canvas that starts fully transparent, with an OPAQUE red block
   * composited onto the left half only — so the right half is genuinely
   * transparent (alpha 0), not merely "has an alpha channel that happens to
   * be 255 everywhere", which a naive test could pass by accident.
   */
  async function transparentPng(): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    const redHalf = await sharp({
      create: {
        width: 50,
        height: 60,
        channels: 4,
        background: { r: 234, g: 67, b: 53, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    return sharp({
      create: {
        width: 100,
        height: 60,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: redHalf, left: 0, top: 0 }])
      .png()
      .toBuffer();
  }

  async function opaqueJpeg(): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    return sharp({
      create: {
        width: 100,
        height: 60,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  it("keeps a transparent region transparent, encoded as WebP", async () => {
    const sharp = (await import("sharp")).default;
    const png = await transparentPng();

    const { bytes, format } = await normalisePhoto(
      new Blob([new Uint8Array(png)]),
    );

    // THE BUG, pinned directly: before the fix this was "jpeg", and the
    // formerly-transparent region below came back solid black — verified by
    // hand while diagnosing this, and asserted here so it cannot regress.
    assert.equal(format, "webp");
    assert.equal(PHOTO_CONTENT_TYPE[format], "image/webp");

    const raw = await sharp(bytes).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    // The right half started fully transparent and nothing was ever
    // composited onto it — sample well inside that region.
    const x = Math.round(raw.info.width * 0.75);
    const y = Math.round(raw.info.height * 0.5);
    const idx = (y * raw.info.width + x) * raw.info.channels;
    assert.equal(
      raw.data[idx + 3],
      0,
      `expected alpha 0 at (${x},${y}), got ${raw.data[idx + 3]} — a transparent region must not come back opaque`,
    );

    // And the opaque red half must still read as opaque, not itself
    // corrupted by whatever fixed the transparent side.
    const idxRed =
      (y * raw.info.width + Math.round(raw.info.width * 0.25)) *
      raw.info.channels;
    assert.equal(raw.data[idxRed + 3], 255);
  });

  it("leaves an ordinary opaque photo as JPEG — no format change for images with nothing to preserve", async () => {
    const jpeg = await opaqueJpeg();
    const { format } = await normalisePhoto(new Blob([new Uint8Array(jpeg)]));
    assert.equal(format, "jpeg");
    assert.equal(PHOTO_CONTENT_TYPE[format], "image/jpeg");
  });
});

describe("crm form helpers", () => {
  it("folds accents into a slug rather than dropping the letter", () => {
    // "Joël" must become joel, not jol — the id ends up in a URL and is what
    // the photo upload looks the record up by.
    assert.equal(slugify("Joël Fah"), "joel-fah");
    assert.equal(slugify("Abdel Aziz MFOSSA"), "abdel-aziz-mfossa");
    assert.equal(
      slugify("Grace Divine Tchuenteu Ebe'ete"),
      "grace-divine-tchuenteu-ebe-ete",
    );
  });

  it("never leaves a slug with stray separators", () => {
    assert.equal(slugify("  --Hello,   World!! "), "hello-world");
    assert.equal(slugify(""), "");
  });

  it("adds a duration to a start time", () => {
    assert.equal(endsAt("09:00", 30), "09:30");
    assert.equal(endsAt("14:45", 90), "16:15");
  });

  it("wraps past midnight instead of showing an hour no clock has", () => {
    assert.equal(endsAt("23:30", 60), "00:30");
  });

  it("says so rather than guessing when the time is unparseable", () => {
    assert.equal(endsAt("", 30), "—");
    assert.equal(endsAt("nonsense", 30), "—");
  });

  it("shows and reads back datetimes as Yaoundé wall-clock, not the editor's", () => {
    // The instant below IS 23:59 in Yaoundé. Whatever timezone this test runs
    // in, the admin field must read 23:59 — that is the whole point.
    assert.equal(isoToWatLocal("2026-10-31T22:59:00.000Z"), "2026-10-31T23:59");
    assert.equal(watLocalToIso("2026-10-31T23:59"), "2026-10-31T22:59:00.000Z");
  });

  it("round-trips a datetime through the field unchanged", () => {
    const iso = "2026-09-05T00:00:00.000Z";
    assert.equal(watLocalToIso(isoToWatLocal(iso)), iso);
  });

  it("treats an empty or broken datetime as no bound, not as epoch", () => {
    assert.equal(isoToWatLocal(null), "");
    assert.equal(isoToWatLocal("nonsense"), "");
    assert.equal(watLocalToIso(""), null);
    assert.equal(watLocalToIso("nonsense"), null);
  });
});

describe("the hero's sticker scatter", () => {
  /* Random output, so every assertion runs over many rolls — a property that
     holds once may just have been a lucky seed. */
  const ROLLS = 200;

  it("never picks the same sticker twice in one scatter", () => {
    // Two of the same sticker is what React reported as a duplicate key, and
    // it silently dropped one of them. Sampling without replacement is the
    // fix; this is the guard on it.
    for (let i = 0; i < ROLLS; i += 1) {
      for (const mobile of [true, false]) {
        const ids = pickStickers(mobile).map((s) => s.id);
        assert.equal(new Set(ids).size, ids.length);
      }
    }
  });

  it("gives every placement a unique key", () => {
    for (let i = 0; i < ROLLS; i += 1) {
      const keys = pickStickers(false).map((s) => s.key);
      assert.equal(new Set(keys).size, keys.length);
    }
  });

  it("never places a sticker outside a declared zone", () => {
    /* The whole point of zones: unbounded randomness eventually drops a
       coffee cup on "Grab your ticket", and on a page that re-rolls every
       load "eventually" is somebody's first impression. */
    const inSomeZone = (
      s: { left: number; top: number },
      zones: { x: number; y: number; w: number; h: number }[],
    ) =>
      zones.some(
        (z) =>
          s.left >= z.x &&
          s.left <= z.x + z.w &&
          s.top >= z.y &&
          s.top <= z.y + z.h,
      );

    for (let i = 0; i < ROLLS; i += 1) {
      for (const [mobile, zones] of [
        [false, DESKTOP_ZONES],
        [true, MOBILE_ZONES],
      ] as const) {
        for (const placed of pickStickers(mobile)) {
          assert.ok(
            inSomeZone(placed, [...zones]),
            `${placed.id} at ${placed.left},${placed.top} escaped its zones`,
          );
        }
      }
    }
  });

  it("keeps depth and blur in step, so far things are soft and near ones sharp", () => {
    // Picked independently, fake depth of field reads as an effect rather
    // than as distance. A tier decides both, so the two can never disagree.
    for (let i = 0; i < ROLLS; i += 1) {
      for (const s of pickStickers(false)) {
        if (s.blur > 2)
          assert.ok(s.depth <= 12, "a blurred sticker leaned far");
        if (s.depth >= 22)
          assert.equal(s.blur, 0, "a near sticker was blurred");
      }
    }
  });

  it("thins the cluster right down on a phone", () => {
    for (let i = 0; i < ROLLS; i += 1) {
      assert.ok(pickStickers(true).length <= 3);
      assert.ok(pickStickers(false).length >= 6);
    }
  });
});

describe("the testimonial section's sticker scatter", () => {
  const ROLLS = 200;

  it("draws its whole pool from real stickers in the sheet", () => {
    // The two drawn for this section (heart, thumbsup) are only real if
    // they actually resolve through the same lookup `drawStickerPreview`
    // uses — a typo'd id here would silently draw nothing.
    for (const id of QUOTE_STICKER_POOL) {
      assert.ok(findSticker(id), `${id} is not in the sticker sheet`);
    }
  });

  it("never repeats a sticker within one assignment", () => {
    for (let i = 0; i < ROLLS; i += 1) {
      const ids = pickQuoteStickers().map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length);
    }
  });

  it("fills one sticker per slot, in the declared range for that slot", () => {
    for (let i = 0; i < ROLLS; i += 1) {
      const placed = pickQuoteStickers();
      assert.equal(placed.length, QUOTE_SLOTS.length);
      const bySlot = new Map(placed.map((p) => [p.slotKey, p]));
      for (const slot of QUOTE_SLOTS) {
        const p = bySlot.get(slot.key);
        assert.ok(p, `${slot.key} was left unfilled`);
        assert.ok(
          p!.tilt >= slot.tiltRange[0] && p!.tilt <= slot.tiltRange[1],
          `${slot.key} tilt ${p!.tilt} escaped [${slot.tiltRange}]`,
        );
      }
    }
  });
});

describe("which photos the optimiser is allowed to fetch", () => {
  const HOST = "abcdef.supabase.co";

  it("optimises our own paths and our own bucket", () => {
    assert.equal(canOptimise("/placeholders/memory-1.svg", HOST), true);
    assert.equal(
      canOptimise(
        `https://${HOST}/storage/v1/object/public/editorial/team/x.jpg`,
        HOST,
      ),
      true,
    );
  });

  it("refuses any other host instead of throwing at render", () => {
    // next/image THROWS on a host missing from remotePatterns, and it throws
    // while rendering — so one pasted URL in a CSV import would take the page
    // down with a 500 rather than show one broken picture.
    assert.equal(canOptimise("https://example.com/me.jpg", HOST), false);
    assert.equal(canOptimise(`http://${HOST}/x.jpg`, HOST), false);
    assert.equal(canOptimise("not a url at all", HOST), false);
  });

  it("refuses everything remote when no host is configured", () => {
    assert.equal(canOptimise("https://example.com/me.jpg", null), false);
    assert.equal(canOptimise("/placeholders/memory-1.svg", null), true);
  });
});

describe("sponsor seats and the sponsor call", () => {
  const CALL = {
    prospectusUrl: "https://drive.google.com/file/d/abc/view",
    enabled: true,
    closesAt: null as string | null,
  };
  const sponsor = (id: string): Sponsor => ({
    id,
    name: id,
    logoUrl: `/logos/${id}.svg`,
    tier: "opus",
  });

  it("leaves the rest of the row visibly open when nobody has signed", () => {
    const seats = sponsorSeats([]);
    assert.equal(seats.length, SPONSOR_SEATS);
    assert.ok(seats.every((s) => s.kind === "empty"));
  });

  it("fills from the left and keeps the remaining seats", () => {
    const seats = sponsorSeats([sponsor("a"), sponsor("b")]);
    assert.equal(seats.length, SPONSOR_SEATS);
    assert.deepEqual(
      seats.map((s) => s.kind),
      ["filled", "filled", "empty", "empty", "empty", "empty"],
    );
  });

  it("shows every sponsor when there are more of them than seats", () => {
    const many = Array.from({ length: 9 }, (_, i) => sponsor(`s${i}`));
    const seats = sponsorSeats(many);
    assert.equal(seats.length, 9);
    assert.ok(seats.every((s) => s.kind === "filled"));
  });

  it("asks while the call is on and the deadline has not arrived", () => {
    assert.equal(sponsorCallOpen(CALL), true);
    assert.equal(
      sponsorCallOpen(
        { ...CALL, closesAt: "2026-10-01T00:00:00Z" },
        new Date("2026-09-20T00:00:00Z"),
      ),
      true,
    );
  });

  it("stops asking after the close date", () => {
    assert.equal(
      sponsorCallOpen(
        { ...CALL, closesAt: "2026-10-01T00:00:00Z" },
        new Date("2026-10-02T00:00:00Z"),
      ),
      false,
    );
  });

  it("lets the switch beat a deadline that has not arrived", () => {
    assert.equal(
      sponsorCallOpen(
        { ...CALL, enabled: false, closesAt: "2026-12-01T00:00:00Z" },
        new Date("2026-09-20T00:00:00Z"),
      ),
      false,
    );
  });

  it("does not ask when there is no prospectus behind the button", () => {
    assert.equal(sponsorCallOpen({ ...CALL, prospectusUrl: "   " }), false);
  });

  it("treats an unparseable close date as a typo, not as closed", () => {
    assert.equal(sponsorCallOpen({ ...CALL, closesAt: "soon" }), true);
  });
});

describe("call for speakers", () => {
  const WINDOW = {
    url: "https://sessionize.com/devfest-yaounde-2026",
    opensAt: "2026-09-05T01:00:00+01:00",
    closesAt: "2026-10-31T23:59:00+01:00",
    override: "auto" as const,
  };
  const at = (iso: string) => new Date(iso);

  it("invites submissions while the window is open and nobody is announced", () => {
    const view = cfsView(WINDOW, 0, at("2026-09-08T12:00:00+01:00"));
    assert.equal(view.state, "open");
    assert.equal(cfsAcceptsSubmissions(view), true);
  });

  it("waits before the window opens rather than inviting early", () => {
    assert.equal(
      cfsView(WINDOW, 0, at("2026-09-01T12:00:00+01:00")).state,
      "waiting",
    );
  });

  it("stops inviting the moment the window shuts", () => {
    // One minute past close. The button must not still be live.
    const view = cfsView(WINDOW, 0, at("2026-11-01T00:00:00+01:00"));
    assert.equal(view.state, "closed");
    assert.equal(cfsAcceptsSubmissions(view), false);
  });

  it("shows the lineup as soon as one speaker exists", () => {
    assert.equal(
      cfsView(WINDOW, 1, at("2026-09-08T12:00:00+01:00")).state,
      "lineup",
    );
  });

  it("lets the override win in both directions", () => {
    // A lineup announced before it has been entered.
    assert.equal(
      cfsView(
        { ...WINDOW, override: "force-off" },
        0,
        at("2026-09-08T12:00:00+01:00"),
      ).state,
      "lineup",
    );
    // A call reopened after somebody was already added.
    assert.equal(
      cfsView(
        { ...WINDOW, override: "force-on" },
        5,
        at("2026-09-08T12:00:00+01:00"),
      ).state,
      "open",
    );
  });

  it("treats a cleared deadline as open, not as shut", () => {
    // Somebody blanking the close date in the dashboard must not silently
    // hide the invitation.
    const view = cfsView(
      { ...WINDOW, opensAt: null, closesAt: null },
      0,
      at("2030-01-01T00:00:00Z"),
    );
    assert.equal(view.state, "open");
  });

  it("will not offer a submit button with nowhere to go", () => {
    const view = cfsView(
      { ...WINDOW, url: "" },
      0,
      at("2026-09-08T12:00:00+01:00"),
    );
    assert.equal(view.state, "open");
    assert.equal(cfsAcceptsSubmissions(view), false);
  });

  it("ignores an unparseable date instead of throwing", () => {
    const view = cfsView(
      { ...WINDOW, closesAt: "not a date" },
      0,
      at("2026-09-08T12:00:00+01:00"),
    );
    assert.equal(view.state, "open");
  });
});
