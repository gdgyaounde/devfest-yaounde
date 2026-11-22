/**
 * "The pitch vote is open" email (ADR 0099) and its recipient list.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildRecipients, countBySource } from "@/lib/admin/recipients";
import { renderVoteAnnouncement, VOTE_SUBJECT } from "@/lib/email/templates";
import { PITCH_PROJECTS } from "@/lib/pitch-vote";
import { SITE_URL } from "@/lib/site-config";

const email = renderVoteAnnouncement();

describe("the vote-is-open email", () => {
  it("has its subject, French first then English", () => {
    assert.equal(email.subject, VOTE_SUBJECT);
    assert.ok(
      email.html.indexOf('lang="fr"') < email.html.indexOf('<div lang="en">'),
    );
    assert.ok(email.text.indexOf("Salut") < email.text.indexOf("Hi!"));
  });

  it("states the close as the API enforces it, in both languages", () => {
    assert.match(email.text, /Jusqu'au mardi 24 novembre à 23h59/);
    assert.match(email.text, /Until Tuesday 24 November at 23:59/);
  });

  it("says two votes, names every project and links to /vote in each language", () => {
    assert.match(email.text, /Deux voix par personne/);
    assert.match(email.text, /Two votes each/);
    for (const p of PITCH_PROJECTS) {
      assert.equal(email.text.split(p.name).length - 1 >= 2, true, p.name);
    }
    assert.match(email.html, new RegExp(`${SITE_URL}/fr/vote`));
    assert.match(email.html, new RegExp(`${SITE_URL}/en/vote`));
  });

  it("credits Impact Hub, with the logo and a text fallback", () => {
    assert.match(email.text, /propulsé par Impact Hub Yaoundé/);
    assert.match(email.text, /powered by Impact Hub Yaoundé/);
    assert.match(
      email.html,
      /src="https:\/\/[^"]+\/sponsors\/impact-hub-yaounde\.png"[^>]*alt="Impact Hub Yaoundé"/,
    );
  });

  it("is email-client safe: absolute https only, no JS, no external CSS", () => {
    const urls = [...email.html.matchAll(/(?:href|src)="([^"]+)"/g)].map(
      (m) => m[1],
    );
    assert.ok(urls.length > 4);
    for (const url of urls) assert.match(url, /^(https:\/\/|mailto:)/, url);
    assert.doesNotMatch(email.html, /<script|<link[^>]+stylesheet|<style/i);
  });

  it("has nothing left to fill in", () => {
    for (const body of [email.html, email.text]) {
      assert.doesNotMatch(body, /\{[a-zA-Z]+\}|undefined|NaN|\bnull\b/);
    }
  });

  it("matches the committed files — run `npm run emails:render` if this fails", () => {
    const base = join(process.cwd(), "docs/content/emails/vote-open-2026-11");
    assert.equal(
      readFileSync(`${base}.html`, "utf8").trimEnd(),
      email.html.trimEnd(),
    );
    assert.equal(
      readFileSync(`${base}.txt`, "utf8"),
      `Subject: ${email.subject}\n\n${email.text}\n`,
    );
  });
});

describe("its recipients: every account, once", () => {
  it("lists accounts only, de-duplicated and lower-cased", () => {
    const rows = buildRecipients({
      tickets: [],
      intents: [],
      profiles: [
        { email: "Ada@Example.cm", display_name: "Ada" },
        { email: "ada@example.cm", display_name: null },
        { email: "not an email", display_name: "x" },
        { email: null, display_name: "y" },
      ],
    });
    assert.deepEqual(
      rows.map((r) => [r.email, r.name, r.source]),
      [["ada@example.cm", "Ada", "profile"]],
    );
    assert.deepEqual(countBySource(rows), { ticket: 0, buyer: 0, profile: 1 });
  });
});
