/**
 * The certificates Apps Script (tools/certificates/src, ADR 0100): its pure
 * helpers, run here in a sandbox with no Google services. Proves the parts
 * that decide what is PRINTED and SENT: placeholders, the role lines, the
 * certificate numbers — and that every .gs file at least parses.
 *
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { randomUUID } from "node:crypto";

import { CERTIFICATE_ID } from "@/lib/certificates/rules";

const DIR = join(process.cwd(), "tools/certificates/src");
const files = readdirSync(DIR).filter((f) => f.endsWith(".gs"));

// Load every .gs into one context, like Apps Script's single global scope.
// `const` declarations don't attach to the context, so expose what we test.
const context = vm.createContext({
  console,
  Utilities: { getUuid: () => randomUUID() },
});
vm.runInContext(
  files.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n;\n") +
    "\n;globalThis.__t = { fill_, placeholderValues_, idAllocator_, CERTIFICATE_ID_RE, renderEmail_, wordSetting_, paragraphsHtml_, ROLE_COPY_, escapeHtml_, STATUS, COLUMNS, ROLES, EMAIL_RE, defaultSettings_ };",
  context,
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const t = (context as any).__t;

const settings = Object.fromEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t.defaultSettings_(2026).map((d: any[]) => [d[0], d[1]]),
);
Object.assign(settings, {
  edition: "2026",
  template_id: "x",
  event_date_fr: "21 novembre 2026",
  event_date_en: "21 November 2026",
});
const row = {
  full_name: "Ada Lovelace",
  email: "ada@example.cm",
  role: "speaker",
  detail: "L'IA à l'échelle",
  certificate_id: "DFY26-K7QM-4XHT",
};

describe("the Apps Script files", () => {
  it("all parse, and the roles match the site's", () => {
    assert.ok(files.length >= 5, files.join(", "));
    assert.deepEqual(
      [...t.ROLES],
      ["attendee", "speaker", "volunteer", "organiser", "partner"],
    );
  });
});

describe("placeholders", () => {
  const values = t.placeholderValues_(settings, row);

  it("fills names, roles, role lines, the number and the verify link", () => {
    assert.equal(values.first_name, "Ada Lovelace");
    const name = (full_name: string) =>
      t.placeholderValues_(settings, { ...row, full_name }).first_name;
    assert.equal(name("Ada King Lovelace"), "Ada King");
    assert.equal(name("  Ada  "), "Ada");
    assert.equal(values.role, "Speaker");
    assert.equal(values.role_fr, undefined);
    assert.equal(values.role_line_en, "for sharing their knowledge and inspiring the community at DevFest Yaoundé 2026");
    assert.equal(
      values.verify_url,
      "https://devfest.gdgyaounde.com/certificates/DFY26-K7QM-4XHT",
    );
    assert.equal(
      t.fill_("{{full_name}} — {{ role }}, {{event_date_fr}}", values),
      "Ada Lovelace — Speaker, 21 novembre 2026",
    );
  });

  it("prints one role label per role, from Settings, with safe fallbacks", () => {
    const custom = { ...settings, role_speaker: "Intervenant·e" };
    assert.equal(t.placeholderValues_(custom, row).role, "Intervenant·e");
    // A sheet set up before the single label: its old role_en_* still works.
    const old = { ...settings, role_speaker: "", role_en_speaker: "Talker" };
    assert.equal(t.placeholderValues_(old, row).role, "Talker");
    const bare = { ...settings, role_speaker: "" };
    assert.equal(t.placeholderValues_(bare, row).role, "Speaker");
  });

  it("refuses an unknown placeholder instead of printing it", () => {
    assert.throws(
      () => t.fill_("Hello {{fullname}}", values),
      /Unknown placeholder/,
    );
  });

  it("escapes values for the HTML email only", () => {
    const v = { ...values, detail: `<b>"x"</b>` };
    assert.equal(
      t.fill_("{{detail}}", v, true),
      "&lt;b&gt;&quot;x&quot;&lt;/b&gt;",
    );
    assert.equal(t.fill_("{{detail}}", v), `<b>"x"</b>`);
  });

  it("the default subject and every role line fill without errors", () => {
    for (const role of t.ROLES) {
      const v = t.placeholderValues_(settings, { ...row, role });
      assert.ok(v.role_line_fr && v.role_line_en, role);
      assert.ok(v.role && v.role !== role, `${role} has a printed label`);
      assert.doesNotMatch(t.fill_(settings.email_subject, v), /\{\{/);
    }
  });
});

describe("each role's words", () => {
  const html = readFileSync(join(DIR, "email.html"), "utf8");
  const text = readFileSync(join(DIR, "email_text.html"), "utf8");

  for (const role of ["attendee", "speaker", "volunteer", "organiser", "partner"]) {
    it(`${role}: its own subject, headline, message and P.S., fully filled`, () => {
      const mail = t.renderEmail_(settings, { ...row, role }, html, text);
      for (const part of [mail.subject, mail.html, mail.text]) {
        assert.doesNotMatch(part, /\{\{|\}\}/);
      }
      const c = t.ROLE_COPY_[role];
      assert.ok(mail.subject.includes("Ada") || mail.subject.includes("DevFest"));
      assert.ok(mail.html.includes(t.escapeHtml_(c.title_fr)), "French headline");
      assert.ok(mail.html.includes(t.escapeHtml_(c.title_en)), "English headline");
      // Three paragraphs per language, plus the P.S., as real <p>s.
      assert.ok((mail.html.match(/<p style="margin:0 0 16px/g) || []).length >= 8);
      assert.match(mail.html, /font-style:italic[^>]*>P\.S\./);
      assert.match(mail.text, /\nP\.S\./);
      // The email speaks to the person, never about them.
      assert.doesNotMatch(mail.text, /\b(son savoir|their knowledge|pour son engagement)\b/);
    });
  }

  it("every role says something different", () => {
    const titles = t.ROLES.map((r: string) => t.ROLE_COPY_[r].title_en);
    assert.equal(new Set(titles).size, titles.length);
  });

  it("partners are addressed as vous, the community as tu", () => {
    assert.match(t.ROLE_COPY_.partner.message_fr.join(" "), /\bVous\b|\bvous\b/);
    assert.doesNotMatch(t.ROLE_COPY_.partner.message_fr.join(" "), /\b(tu|ton|ta|tes)\b/i);
    assert.match(t.ROLE_COPY_.attendee.message_fr.join(" "), /\btu\b/);
  });

  it("invites everyone to /storytime, in their language", () => {
    for (const role of t.ROLES) {
      const mail = t.renderEmail_(settings, { ...row, role }, html, text);
      assert.match(mail.html, /href="https:\/\/devfest\.gdgyaounde\.com\/fr\/storytime"[^>]*>Laisser mon histoire/);
      assert.match(mail.html, /href="https:\/\/devfest\.gdgyaounde\.com\/en\/storytime"[^>]*>Share my story/);
      assert.match(mail.text, /Share my story: https:\/\/devfest\.gdgyaounde\.com\/en\/storytime/);
      assert.match(t.ROLE_COPY_[role].story_en, /anonym/i, role);
    }
    const none = { ...settings, story_fr_speaker: "", story_en_speaker: "" };
    const mail = t.renderEmail_(none, row, html, text);
    assert.doesNotMatch(mail.html, /storytime/);
    assert.doesNotMatch(mail.text, /storytime|\n{3,}/);
  });

  it("the logo and links point at the site even in test mode", () => {
    const testMode = { ...settings, site_url: "" };
    const mail = t.renderEmail_(testMode, row, html, text);
    assert.match(mail.html, /src="https:\/\/devfest\.gdgyaounde\.com\/logo\/d-logo-left\.png"/);
    assert.doesNotMatch(mail.html, /(src|href)="\//);
  });

  it("a name can't inject HTML into the paragraphs", () => {
    const mail = t.renderEmail_(settings, { ...row, full_name: "<b>Ada</b> L" }, html, text);
    assert.ok(!mail.html.includes("<b>Ada</b>"));
    assert.ok(mail.html.includes("&lt;b&gt;Ada&lt;/b&gt;"));
  });

  it("a missing key falls back to the default; an emptied one stays empty", () => {
    const old = { ...settings };
    delete old.ps_en_speaker;
    assert.equal(t.wordSetting_(old, "ps_en_speaker"), t.ROLE_COPY_.speaker.ps_en);
    const none = { ...settings, ps_en_speaker: "" };
    assert.equal(t.wordSetting_(none, "ps_en_speaker"), "");
    const mail = t.renderEmail_(none, row, html, text);
    assert.ok(!mail.html.includes(t.ROLE_COPY_.speaker.ps_en));
    assert.doesNotMatch(mail.text, /\n{3,}/);
  });

  it("a role without its own subject uses email_subject", () => {
    const plain = { ...settings, subject_speaker: "" };
    const mail = t.renderEmail_(plain, row, html, text);
    assert.equal(mail.subject, "Ton certificat DevFest Yaoundé 2026 · Your DevFest Yaoundé 2026 certificate");
  });

  it("paragraphs: a blank line splits, a newline breaks", () => {
    assert.equal(
      t.paragraphsHtml_("a\nb\n\n c ", "x"),
      '<p style="x">a<br>b</p>\n<p style="x">c</p>',
    );
    assert.equal(t.paragraphsHtml_("", "x"), "");
  });
});

describe("the email templates", () => {
  const values = t.placeholderValues_(settings, row);
  for (const file of ["email.html", "email_text.html"]) {
    it(`${file} only uses known placeholders, and fills completely`, () => {
      const out = t.fill_(
        readFileSync(join(DIR, file), "utf8"),
        values,
        file === "email.html",
      );
      assert.doesNotMatch(out, /\{\{|\}\}/);
      assert.match(out, /DFY26-K7QM-4XHT/);
    });
  }
});

describe("certificate ids", () => {
  it("are the prefix plus a random key, never repeating one in the sheet", () => {
    const taken = [{ certificate_id: "DFY26-K7QM-4XHT" }, { certificate_id: "" }];
    const next = t.idAllocator_("DFY26", taken);
    const ids = Array.from({ length: 500 }, () => next());
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(!ids.includes("DFY26-K7QM-4XHT"));
    for (const id of ids) assert.match(id, /^DFY26-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    // Not a counter: consecutive ids share no obvious order.
    assert.notEqual([...ids].sort().join(), ids.join());
  });

  it("match the site's format, with the same rule on both sides", () => {
    const next = t.idAllocator_("DFY26", []);
    for (let i = 0; i < 200; i++) {
      const id = next();
      assert.match(id, CERTIFICATE_ID);
      assert.match(id, t.CERTIFICATE_ID_RE);
    }
    assert.equal(t.CERTIFICATE_ID_RE.source, CERTIFICATE_ID.source);
    assert.doesNotMatch("DFY26-0042", t.CERTIFICATE_ID_RE);
  });
});
