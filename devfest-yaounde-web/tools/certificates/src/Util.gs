/* ---------------------------------------------------------------------------
 * Placeholders, locking, time budget, triggers.
 * ------------------------------------------------------------------------- */

/** Apps Script stops a run at 6 min; leave room to write the last row. */
const TIME_BUDGET_MS = 4.5 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
    role: role,
    role_fr: settings[`role_fr_${role}`] || role,
    role_en: settings[`role_en_${role}`] || role,
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

/** "DFY26-0042" style ids: the next number after the highest already used. */
function nextIdAllocator_(prefix, rows) {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  rows.forEach((r) => {
    const m = re.exec(String(r.certificate_id));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return () => {
    max += 1;
    return `${prefix}-${String(max).padStart(4, "0")}`;
  };
}

function errorText_(err) {
  return String((err && err.message) || err).slice(0, 300);
}
