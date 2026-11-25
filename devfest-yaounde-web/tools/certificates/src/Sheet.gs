/* ---------------------------------------------------------------------------
 * The spreadsheet: columns, Settings, Log, colours.
 * ------------------------------------------------------------------------- */

const STATUS = {
  PENDING: "Pending",
  GENERATED: "Generated",
  SENT: "Sent",
  ERROR: "Error",
  SKIPPED: "Skipped",
};

/** The edition tab's columns. Read BY NAME, so they may be reordered. */
const COLUMNS = [
  "full_name",
  "email",
  "role",
  "detail",
  "source",
  "certificate_id",
  "status",
  "generated_at",
  "sent_at",
  "pdf_link",
  "error",
  "attempts",
];

/** Must match CERTIFICATE_ROLES on the site (src/lib/certificates/rules.ts). */
const ROLES = ["attendee", "speaker", "volunteer", "organiser", "partner"];

/**
 * Settings keys and their defaults for a new edition column. `{{…}}` inside
 * a value is filled like everywhere else (e.g. the role lines use
 * {{event_name}} and {{detail}}).
 */
function defaultSettings_(edition) {
  const yy = String(edition).slice(2);
  return [
    ["event_name", `DevFest Yaoundé ${edition}`, "Printed on the certificate and in the email."],
    ["event_date_fr", "", "e.g. 21 novembre 2026"],
    ["event_date_en", "", "e.g. 21 November 2026"],
    ["venue", "Yaoundé", ""],
    ["id_prefix", `DFY${yy}`, "Certificate ids look like DFY26-K7QM-4XHT: this prefix, then a random key."],
    ["template_id", "", "The Google Slides template's ID (from its URL)."],
    ["folder_id", "", "Drive folder for the PDFs. Empty = one is created in My Drive."],
    ["site_url", "https://devfest.gdgyaounde.com", "Where certificates are registered and verified. EMPTY = test mode: no registration, no QR code."],
    ["email_subject", `Ton certificat {{event_name}} · Your {{event_name}} certificate`, "Used when a role's subject_* is empty."],
    ["sender_name", "GDG Yaoundé", "The From name."],
    ["reply_to", "gdgyaounde@gmail.com", "Where replies go."],
    ["daily_cap", "", "Optional: send at most this many a day (testing). Empty = Gmail's quota."],
    ["name_max_chars", "26", "Longer names get a smaller font on the certificate."],
    // Per role: the certificate label and line, and the email (Copy.gs).
    ...ROLES.reduce((rows, role) => rows.concat(roleCopySettings_(role)), []),
  ];
}

function ensureSettings_(ss, edition) {
  let sheet = ss.getSheetByName("Settings");
  const defaults = defaultSettings_(edition);
  if (!sheet) {
    sheet = ss.insertSheet("Settings", 0);
    sheet.getRange(1, 1, 1, 2).setValues([["key", "help"]]).setFontWeight("bold");
    sheet.getRange(2, 1, defaults.length, 2).setValues(defaults.map((d) => [d[0], d[2]]));
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
  }
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  let col = header.indexOf(String(edition)) + 1;
  const isNew = col === 0;
  if (isNew) {
    // Add the edition's column just before "help", filled with defaults.
    col = header.indexOf("help") + 1 || header.length + 1;
    sheet.insertColumnBefore(col);
    sheet.getRange(1, col).setValue(String(edition)).setFontWeight("bold");
    sheet.setColumnWidth(col, 320);
  }
  // An existing column only gains the keys it lacks (a newer version of the
  // script added them); values already typed are never touched.
  const helpCol = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String).indexOf("help") + 1;
  const keys = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().map((r) => String(r[0]));
  defaults.forEach((d) => {
    let at = keys.indexOf(d[0]);
    const added = at < 0;
    if (added) {
      sheet.appendRow([d[0]]);
      keys.push(d[0]);
      at = keys.length - 1;
      if (helpCol && d[2]) sheet.getRange(at + 2, helpCol).setValue(d[2]);
    }
    const cell = sheet.getRange(at + 2, col);
    // The words (role_/line_/subject_/title_/message_/ps_/story_) also come back
    // when their cell was emptied, so "clear it and run setup again" restores
    // a default. Never for the rest: an empty site_url means test mode.
    const words = /^(role|line|subject|title|message|ps|story)_/.test(d[0]);
    if (isNew || added || (words && cell.getValue() === "")) cell.setValue(d[1]);
  });
  return sheet;
}

/** The Settings column for an edition, as { key: value }. */
function readSettings_(edition) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Settings");
  if (!sheet) throw new Error("No Settings tab. Run Certificates → Set up a new edition.");
  const values = sheet.getDataRange().getDisplayValues();
  const col = values[0].indexOf(String(edition));
  if (col < 0) throw new Error(`Settings has no column for ${edition}.`);
  const out = { edition: String(edition) };
  for (let r = 1; r < values.length; r++) {
    const key = String(values[r][0]).trim();
    if (key) out[key] = String(values[r][col]).trim();
  }
  const required = ["event_name", "id_prefix", "template_id", "email_subject", "sender_name"];
  const missing = required.filter((k) => !out[k]);
  if (missing.length) throw new Error(`Settings ${edition}: fill ${missing.join(", ")}.`);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(out.id_prefix)) {
    throw new Error(`Settings ${edition}: id_prefix must be letters/digits, starting with a letter (e.g. DFY26).`);
  }
  return out;
}

function ensureLog_(ss) {
  let sheet = ss.getSheetByName("Log");
  if (sheet) return sheet;
  sheet = ss.insertSheet("Log");
  sheet
    .getRange(1, 1, 1, 8)
    .setValues([["when", "who", "edition", "action", "processed", "ok", "errors", "note"]])
    .setFontWeight("bold");
  sheet.setFrozenRows(1);
  return sheet;
}

function log_(edition, action, processed, ok, errors, note) {
  const sheet = ensureLog_(SpreadsheetApp.getActiveSpreadsheet());
  let who = "";
  try {
    who = Session.getEffectiveUser().getEmail();
  } catch (e) {
    who = "(trigger)";
  }
  sheet.appendRow([new Date(), who, String(edition), action, processed, ok, errors, note || ""]);
}

/** The edition tab, with headers, dropdowns and colour-coded statuses. */
function ensureEditionSheet_(ss, edition) {
  let sheet = ss.getSheetByName(String(edition));
  if (!sheet) sheet = ss.insertSheet(String(edition));
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]).setFontWeight("bold").setBackground("#1E1E1E").setFontColor("#F0F0F0");
    sheet.setFrozenRows(1);
  }
  const map = headerMap_(sheet);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);

  sheet
    .getRange(2, map.status + 1, rows, 1)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(Object.values(STATUS), true)
        .setAllowInvalid(false)
        .build(),
    );
  sheet
    .getRange(2, map.role + 1, rows, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ROLES, true).build());

  // Colours follow the VALUE (conditional formatting), so they can't drift.
  const statusRange = sheet.getRange(2, map.status + 1, rows, 1);
  const errorRange = sheet.getRange(2, map.error + 1, rows, 1);
  const colours = [
    [STATUS.PENDING, "#E2E2E2", "#1E1E1E"],
    [STATUS.GENERATED, "#C3ECF6", "#1E1E1E"],
    [STATUS.SENT, "#CCF6C5", "#1E1E1E"],
    [STATUS.ERROR, "#F8D8D8", "#B3261E"],
    [STATUS.SKIPPED, "#FFE7A5", "#1E1E1E"],
  ];
  const rules = colours.map(([value, bg, fg]) =>
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(value)
      .setBackground(bg)
      .setFontColor(fg)
      .setBold(true)
      .setRanges([statusRange])
      .build(),
  );
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenCellNotEmpty()
      .setFontColor("#B3261E")
      .setRanges([errorRange])
      .build(),
  );
  sheet.setConditionalFormatRules(rules);
  sheet.setColumnWidth(map.full_name + 1, 220);
  sheet.setColumnWidth(map.email + 1, 230);
  sheet.setColumnWidth(map.detail + 1, 260);
  sheet.setColumnWidth(map.error + 1, 280);
  return sheet;
}

/** { columnName: zeroBasedIndex } for the sheet's header row. */
function headerMap_(sheet) {
  const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map((h) => String(h).trim());
  const map = {};
  header.forEach((h, i) => {
    if (h) map[h] = i;
  });
  const missing = COLUMNS.filter((c) => map[c] === undefined);
  if (missing.length) {
    throw new Error(`Tab "${sheet.getName()}" is missing columns: ${missing.join(", ")}. Run Set up a new edition.`);
  }
  return map;
}

/**
 * The active edition tab: its name must be a year that has a Settings
 * column. Time-triggered runs pass the edition they were scheduled for.
 */
function editionSheet_(edition) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = edition ? String(edition) : ss.getActiveSheet().getName();
  if (!/^20\d\d$/.test(name)) {
    throw new Error(`Open an edition tab (e.g. "2026") first — "${name}" isn't one.`);
  }
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`No "${name}" tab.`);
  return sheet;
}

/** All data rows as objects, each with its 1-based sheet row number. */
function readRows_(sheet) {
  const map = headerMap_(sheet);
  const last = sheet.getLastRow();
  if (last < 2) return { map, rows: [] };
  const values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  const rows = values.map((v, i) => {
    const row = { _row: i + 2 };
    COLUMNS.forEach((c) => {
      const cell = v[map[c]];
      row[c] = cell instanceof Date ? cell : String(cell === null || cell === undefined ? "" : cell).trim();
    });
    return row;
  });
  return { map, rows: rows.filter((r) => r.full_name || r.email) };
}

/** Writes some fields of one row (by column name). */
function writeRow_(sheet, map, rowNumber, fields) {
  Object.keys(fields).forEach((k) => {
    if (map[k] === undefined) return;
    sheet.getRange(rowNumber, map[k] + 1).setValue(fields[k]);
  });
}
