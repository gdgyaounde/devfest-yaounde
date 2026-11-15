/**
 * The launch-week update emails and their recipient list (ADR 0076).
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildRecipients,
  countBySource,
  recipientsCsv,
} from "@/lib/admin/recipients";
import { LAUNCH_SUBJECT, renderLaunchUpdate } from "@/lib/email/templates";

const paid = renderLaunchUpdate({ audience: "paid" });
const free = renderLaunchUpdate({ audience: "free" });

describe("the launch update renders as a self-contained bilingual email", () => {
  for (const [name, email] of [
    ["paid", paid],
    ["free", free],
  ] as const) {
    it(`${name}: subject, French first then English`, () => {
      assert.equal(email.subject, LAUNCH_SUBJECT);
      assert.match(
        email.subject,
        /ce qui change avant samedi \/ what's changing before Saturday/,
      );
      assert.ok(
        email.html.indexOf('lang="fr"') < email.html.indexOf('<div lang="en">'),
      );
      assert.ok(email.text.indexOf("Salut") < email.text.indexOf("Hi!"));
    });

    it(`${name}: email-client safe — absolute https only, no JS, no external CSS`, () => {
      const urls = [...email.html.matchAll(/(?:href|src)="([^"]+)"/g)].map(
        (m) => m[1],
      );
      assert.ok(urls.length > 5);
      for (const url of urls) {
        assert.match(url, /^(https:\/\/|mailto:)/, url);
      }
      assert.doesNotMatch(email.html, /<script|<link[^>]+stylesheet|<style/i);
      assert.match(email.html, /max-width:600px/);
    });

    it(`${name}: nothing left to fill in`, () => {
      for (const body of [email.html, email.text]) {
        assert.doesNotMatch(body, /\{[a-zA-Z]+\}|undefined|NaN|\bnull\b/);
      }
    });

    it(`${name}: states the day and the cutoff in both languages`, () => {
      assert.match(email.text, /samedi 21 novembre 2026/);
      assert.match(email.text, /Saturday 21 November 2026/);
      assert.match(email.text, /mercredi 18 novembre à 23h59/);
      assert.match(email.text, /Wednesday 18 November at 23:59/);
    });
  }

  it("paid: account (size + name), collector frames, speakers, terms — both locales", () => {
    for (const path of ["/account", "/dp-generator", "/speakers", "/terms"]) {
      assert.match(paid.html, new RegExp(`/fr${path}"`));
      assert.match(paid.html, new RegExp(`/en${path}"`));
    }
    assert.match(paid.text, /T-shirt size and name/);
  });

  it("free: the paid-only rule, the upgrade, what to bring — and no account link", () => {
    assert.match(free.text, /badge, lanyard, bracelet ou similaire/);
    assert.match(free.text, /badge, lanyard, bracelet or similar/);
    assert.match(free.html, /\/fr\/tickets"/);
    assert.match(free.text, /What to bring\?/);
    assert.doesNotMatch(free.html, /\/account"/);
  });
});

describe("the committed files match the renderer", () => {
  for (const audience of ["paid", "free"] as const) {
    it(`${audience} (.html and .txt) — run \`npm run emails:render\` if this fails`, () => {
      const email = renderLaunchUpdate({ audience });
      const base = join(
        process.cwd(),
        `docs/content/emails/launch-update-2026-11.${audience}`,
      );
      assert.equal(
        readFileSync(`${base}.html`, "utf8").trimEnd(),
        email.html.trimEnd(),
      );
      assert.equal(
        readFileSync(`${base}.txt`, "utf8"),
        `Subject: ${email.subject}\n\n${email.text}\n`,
      );
      assert.doesNotMatch(readFileSync(`${base}.html`, "utf8"), /localhost/);
    });
  }
});

describe("the paid recipient list", () => {
  const rows = buildRecipients({
    tickets: [
      {
        attendee_email: "Ama@Example.cm ",
        attendee_name: "Ama Nkeng",
        deposit_id: "d1",
      },
      {
        attendee_email: "bob@example.cm",
        attendee_name: '=HYPERLINK("x")',
        deposit_id: "d1",
      },
    ],
    intents: [
      { deposit_id: "d1", contact: { email: "AMA@example.cm" }, locale: "en" },
      {
        deposit_id: "d2",
        contact: { email: "carol@example.cm" },
        locale: "fr",
      },
      { deposit_id: "d3", contact: null, locale: null },
    ],
    profiles: [
      { email: "carol@example.cm", display_name: "Carol" },
      { email: "dan@example.cm", display_name: null },
      { email: "not-an-email", display_name: "X" },
    ],
  });

  it("lower-cases, de-duplicates, and keeps the strongest source", () => {
    assert.deepEqual(
      rows.map((r) => [r.email, r.source]),
      [
        ["ama@example.cm", "ticket"],
        ["bob@example.cm", "ticket"],
        ["carol@example.cm", "buyer"],
        ["dan@example.cm", "profile"],
      ],
    );
  });

  it("fills a missing name or locale from another source", () => {
    const carol = rows.find((r) => r.email === "carol@example.cm")!;
    assert.equal(carol.name, "Carol");
    assert.equal(carol.locale, "fr");
    assert.equal(rows.find((r) => r.email === "ama@example.cm")!.locale, "en");
  });

  it("counts by source", () => {
    assert.deepEqual(countBySource(rows), { ticket: 2, buyer: 1, profile: 1 });
  });

  it("writes email,name,source,locale and defuses spreadsheet formulas", () => {
    const csv = recipientsCsv(rows);
    assert.match(csv, /^"email","name","source","locale"\r\n/);
    assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  });
});
