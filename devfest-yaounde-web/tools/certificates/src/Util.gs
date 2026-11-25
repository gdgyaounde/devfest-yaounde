/* ---------------------------------------------------------------------------
 * Placeholders, locking, time budget, triggers.
 * ------------------------------------------------------------------------- */

/** Apps Script stops a run at 6 min; leave room to write the last row. */
const TIME_BUDGET_MS = 4.5 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * Where the logo, the footer link and the storytime page live. The site's
 * address even in test mode (site_url empty), so the email never shows a
 * broken logo.
 */
const DEFAULT_SITE_URL = "https://devfest.gdgyaounde.com";

const PLACEHOLDER_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/**
 * Everything a template, an email or a Settings line may use. ONE set, so
 * the certificate, the subject and the email always say the same thing.
 */
function placeholderValues_(settings, row) {
  const role = row.role;
  const base = {
    full_name: row.full_name,
    // The first two names when there are two ("Ada King Lovelace" → "Ada
    // King"): warmer than one, and many people here go by two.
    first_name: String(row.full_name).trim().split(/\s+/).slice(0, 2).join(" ") || row.full_name,
    detail: row.detail || "",
    // The printed role: ONE label per role, from Settings → role_<role>.
    role: wordFor_(settings, "role", row) || settings[`role_en_${role}`] || (ROLE_COPY_[role] && ROLE_COPY_[role].label) || role,
    ticket: isPaid_(row) ? "paid" : "free",
    certificate_id: row.certificate_id,
    // Test mode (no site_url): no verify link either.
    verify_url: settings.site_url
      ? `${settings.site_url.replace(/\/$/, "")}/certificates/${row.certificate_id}`
      : "",
    site_url: settings.site_url,
    home_url: (settings.site_url || DEFAULT_SITE_URL).replace(/\/$/, ""),
    event_name: settings.event_name,
    event_date_fr: settings.event_date_fr || "",
    event_date_en: settings.event_date_en || "",
    venue: settings.venue || "",
    edition: settings.edition,
    sender_name: settings.sender_name,
  };
  // The role lines may themselves use placeholders ({{event_name}}, {{detail}}).
  base.role_line_fr = fill_(wordFor_(settings, "line_fr", row), base);
  base.role_line_en = fill_(wordFor_(settings, "line_en", row), base);
  // The email's words for this role. They may use any placeholder above.
  ["fr", "en"].forEach((lang) => {
    base[`email_title_${lang}`] = fill_(wordFor_(settings, `title_${lang}`, row), base);
    base[`message_${lang}`] = fill_(wordFor_(settings, `message_${lang}`, row), base);
    base[`ps_${lang}`] = fill_(wordFor_(settings, `ps_${lang}`, row), base);
    base[`story_${lang}`] = fill_(wordFor_(settings, `story_${lang}`, row), base);
    base[`storytime_url_${lang}`] = `${base.home_url}/${lang}/storytime`;
  });
  return base;
}

/**
 * A role's words from Settings. A key the sheet doesn't have yet (set up
 * before the script knew it) falls back to the default in Copy.gs; a key
 * that is there but empty stays empty — that's someone's choice.
 */
function wordSetting_(settings, key) {
  if (key in settings) return settings[key];
  const value = defaultSetting_(settings.edition, key);
  return value === undefined ? "" : value;
}

/** A row with a paid ticket ("paid", or "payé" typed by hand). */
function isPaid_(row) {
  return /^(paid|pay[ée])$/i.test(String(row.ticket || "").trim());
}

/**
 * A word for this row: "<base>_<role>", or for a paid ticket
 * "<base>_<role>_paid" (from the sheet, else Copy.gs). A paid word that
 * doesn't exist or is EMPTY gives the regular one.
 */
function wordFor_(settings, base, row) {
  const plain = `${base}_${row.role}`;
  if (isPaid_(row)) {
    const paid = wordSetting_(settings, `${plain}_paid`);
    if (paid) return paid;
  }
  return wordSetting_(settings, plain);
}

function defaultSetting_(edition, key) {
  const row = defaultSettings_(edition).filter((d) => d[0] === key)[0];
  return row ? row[1] : undefined;
}

/** The Slides template for this row: template_id_paid for paid tickets, if set. */
function templateFor_(settings, row) {
  return (isPaid_(row) && settings.template_id_paid) || settings.template_id;
}

/** Plain text to email paragraphs: a blank line splits, a single newline breaks. */
function paragraphsHtml_(text, style) {
  return String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${style}">${escapeHtml_(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * Replaces every {{name}} (spaces allowed: {{ full_name }}). An UNKNOWN name
 * throws — a certificate must never go out with a literal "{{…}}" on it.
 */
function fill_(text, values, escape, raw) {
  return String(text).replace(PLACEHOLDER_RE, (_, name) => {
    const key = name.toLowerCase();
    // Already-built HTML (the email's paragraphs), inserted as is.
    if (raw && key in raw) return raw[key];
    if (!(key in values)) throw new Error(`Unknown placeholder {{${name}}}`);
    const value = String(values[key]);
    return escape ? escapeHtml_(value) : value;
  });
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One run at a time, across menu clicks and triggers. */
function withLock_(fn) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) {
    throw new Error("Another certificates run is in progress. Try again in a minute.");
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function now_() {
  return new Date();
}

function outOfTime_(startedAt) {
  return Date.now() - startedAt > TIME_BUDGET_MS;
}

function removeTriggers_(handlers) {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  return removed;
}

/** Continue a long generation in a minute (a run stops at ~5 minutes). */
function scheduleGenerateSoon_(edition) {
  removeTriggers_(["continueGenerate"]);
  PropertiesService.getScriptProperties().setProperty("CONTINUE_EDITION", String(edition));
  ScriptApp.newTrigger("continueGenerate").timeBased().after(60 * 1000).create();
}

/** Continue sending tomorrow morning, when Gmail's daily quota is back. */
function scheduleSendTomorrow_(edition) {
  removeTriggers_(["continueSend"]);
  PropertiesService.getScriptProperties().setProperty("CONTINUE_EDITION", String(edition));
  ScriptApp.newTrigger("continueSend").timeBased().everyDays(1).atHour(8).create();
}

/** Toasts when run from the menu; silent from a trigger. */
function toast_(message) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, "Certificates", 8);
  } catch (e) {
    // Triggers have no UI.
  }
}

function alert_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    console.log(message);
  }
}

/** A Drive folder by id, or created by name inside a parent. */
function childFolder_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function rootFolder_(settings) {
  if (settings.folder_id) return DriveApp.getFolderById(settings.folder_id);
  return childFolder_(DriveApp.getRootFolder(), "DevFest Yaoundé — Certificates");
}

/** Crockford base32: no I, L, O or U, so nothing on a certificate is misread. */
const ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Must match CERTIFICATE_ID on the site (src/lib/certificates/rules.ts). */
const CERTIFICATE_ID_RE = /^[A-Z][A-Z0-9]{1,9}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** Eight random characters (40 bits) from a v4 UUID's random hex. */
function randomKey_() {
  // The first 10 hex digits of a v4 UUID are all random.
  let n = parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 10), 16);
  let key = "";
  for (let i = 0; i < 8; i++) {
    key = ID_ALPHABET[n % 32] + key;
    n = Math.floor(n / 32);
  }
  return key;
}

/**
 * "DFY26-K7QM-4XHT" style ids: the prefix, then a random key — never a
 * running number, so nobody can walk the verify page and list every holder.
 * Never repeats an id already in the sheet.
 */
function idAllocator_(prefix, rows) {
  const used = {};
  rows.forEach((r) => {
    if (r.certificate_id) used[String(r.certificate_id)] = true;
  });
  return () => {
    for (;;) {
      const key = randomKey_();
      const id = `${prefix}-${key.slice(0, 4)}-${key.slice(4)}`;
      if (!used[id]) {
        used[id] = true;
        return id;
      }
    }
  };
}

function errorText_(err) {
  return String((err && err.message) || err).slice(0, 300);
}
