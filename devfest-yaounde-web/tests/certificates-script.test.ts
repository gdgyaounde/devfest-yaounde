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

const DIR = join(process.cwd(), "tools/certificates/src");
const files = readdirSync(DIR).filter((f) => f.endsWith(".gs"));

// Load every .gs into one context, like Apps Script's single global scope.
// `const` declarations don't attach to the context, so expose what we test.
const context = vm.createContext({ console });
vm.runInContext(
  files.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n;\n") +
    "\n;globalThis.__t = { fill_, placeholderValues_, nextIdAllocator_, escapeHtml_, STATUS, COLUMNS, ROLES, EMAIL_RE, defaultSettings_ };",
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
  certificate_id: "DFY26-0042",
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
    assert.equal(values.first_name, "Ada");
    assert.equal(values.role_fr, "Intervenant·e");
    assert.equal(values.role_line_en, "for speaking at DevFest Yaoundé 2026");
    assert.equal(
      values.verify_url,
      "https://devfest.gdgyaounde.com/certificates/DFY26-0042",
    );
    assert.equal(
      t.fill_("{{full_name}} — {{ role_en }}, {{event_date_fr}}", values),
      "Ada Lovelace — Speaker, 21 novembre 2026",
    );
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
      assert.doesNotMatch(t.fill_(settings.email_subject, v), /\{\{/);
    }
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
      assert.match(out, /DFY26-0042/);
    });
  }
});

describe("certificate numbers", () => {
  it("continue after the highest used, padded, never reusing one", () => {
    const next = t.nextIdAllocator_("DFY26", [
      { certificate_id: "DFY26-0007" },
      { certificate_id: "DFY26-0012" },
      { certificate_id: "DFY27-0099" },
      { certificate_id: "" },
    ]);
    assert.equal(next(), "DFY26-0013");
    assert.equal(next(), "DFY26-0014");
  });

  it("match the site's format", () => {
    const next = t.nextIdAllocator_("DFY26", []);
    assert.match(next(), /^[A-Z][A-Z0-9]{1,9}-\d{3,6}$/);
  });
});
