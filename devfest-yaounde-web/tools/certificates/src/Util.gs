/* ---------------------------------------------------------------------------
 * Placeholders, locking, time budget, triggers.
 * ------------------------------------------------------------------------- */

/** Apps Script stops a run at 6 min; leave room to write the last row. */
const TIME_BUDGET_MS = 4.5 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_ROLE_LABELS = {
  attendee: "Attendee",
  speaker: "Speaker",
  volunteer: "Volunteer",
  organiser: "Organiser",
  partner: "Partner",
};

const PLACEHOLDER_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/**
 * Everything a template, an email or a Settings line may use. ONE set, so
 * the certificate, the subject and the email always say the same thing.
 */
function placeholderValues_(settings, row) {
  const role = row.role;
  const base = {
    full_name: row.full_name,
    first_name: String(row.full_name).split(/\s+/)[0] || row.full_name,
    detail: row.detail || "",
    // The printed role: ONE label per role, from Settings → role_<role>.
    role: settings[`role_${role}`] || settings[`role_en_${role}`] || DEFAULT_ROLE_LABELS[role] || role,
    certificate_id: row.certificate_id,
    // Test mode (no site_url): no verify link either.
    verify_url: settings.site_url
      ? `${settings.site_url.replace(/\/$/, "")}/certificates/${row.certificate_id}`
      : "",
    site_url: settings.site_url,
    event_name: settings.event_name,
    event_date_fr: settings.event_date_fr || "",
    event_date_en: settings.event_date_en || "",
    venue: settings.venue || "",
    edition: settings.edition,
    sender_name: settings.sender_name,
  };
  // The role lines may themselves use placeholders ({{event_name}}, {{detail}}).
  base.role_line_fr = fill_(settings[`line_fr_${role}`] || "", base);
  base.role_line_en = fill_(settings[`line_en_${role}`] || "", base);
  return base;
}

/**
 * Replaces every {{name}} (spaces allowed: {{ full_name }}). An UNKNOWN name
 * throws — a certificate must never go out with a literal "{{…}}" on it.
 */
function fill_(text, values, escape) {
  return String(text).replace(PLACEHOLDER_RE, (_, name) => {
    const key = name.toLowerCase();
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
