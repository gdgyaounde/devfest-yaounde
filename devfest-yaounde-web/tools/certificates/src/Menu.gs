/**
 * DevFest Yaoundé — event certificates (ADR 0100).
 *
 * A Google Sheet, a Google Slides template and Gmail:
 *   1. Check rows     — catch bad emails, duplicates, unknown roles first;
 *   2. Generate PDFs  — fill the template per row, save the PDF in Drive,
 *                       and register the certificate on the site so its QR
 *                       code proves it is genuine;
 *   3. Send a test    — the real email + PDF, to yourself only;
 *   4. Send emails    — HTML email with the PDF attached, then status Sent.
 *
 * One tab per edition ("2026", "2027", …) and a Settings tab with one
 * column per edition: a new year is a new tab and a new Settings column.
 *
 * Source of truth: tools/certificates/ in the devfest-yaounde-web repo,
 * pushed with clasp. Edit there, not in the browser editor.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Certificates")
    .addItem("1 · Check rows", "checkRows")
    .addItem("2 · Generate PDFs", "generateCertificates")
    .addItem("3 · Send a test to me (selected row)", "sendTestToMe")
    .addItem("4 · Send emails", "sendCertificates")
    .addSeparator()
    .addItem("Retry errors", "retryErrors")
    .addItem("Reset selected rows", "resetSelectedRows")
    .addItem("Stop scheduled runs", "stopScheduledRuns")
    .addSeparator()
    .addItem("Set up a new edition…", "setupEdition")
    .addItem("Connect to the site (secret)…", "setSiteSecret")
    .addToUi();
}

/**
 * Creates (or completes) the Settings, Log and edition tabs — headers,
 * dropdowns, colour-coded statuses — so a new year starts from a clean,
 * consistent sheet. Safe to run again: it never deletes rows.
 */
function setupEdition() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt(
    "Set up an edition",
    "Which year? (e.g. 2026). Creates the tab and its Settings column if missing.",
    ui.ButtonSet.OK_CANCEL,
  );
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const edition = answer.getResponseText().trim();
  if (!/^20\d\d$/.test(edition)) {
    ui.alert("A year like 2026, please.");
    return;
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSettings_(ss, edition);
  ensureLog_(ss);
  const sheet = ensureEditionSheet_(ss, edition);
  ss.setActiveSheet(sheet);
  log_(edition, "setup", 0, 0, 0, "Edition tab and Settings column ready");
  ui.alert(
    `Edition ${edition} is ready.\n\n` +
      "Next:\n" +
      "• Fill the Settings column (template_id at least).\n" +
      "• Paste the list (from the site's dashboard → Certificates) under the headers.\n" +
      "• Certificates → Connect to the site, once per spreadsheet copy.",
  );
}

/** Stores the site's CERTIFICATES_SECRET in Script Properties (never in the sheet). */
function setSiteSecret() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt(
    "Connect to the site",
    "Paste CERTIFICATES_SECRET (the same value as on Vercel). It is stored in the script's properties, not in the sheet.",
    ui.ButtonSet.OK_CANCEL,
  );
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const secret = answer.getResponseText().trim();
  if (secret.length < 16) {
    ui.alert("That looks too short. Nothing was saved.");
    return;
  }
  PropertiesService.getScriptProperties().setProperty("SITE_SECRET", secret);
  ui.alert("Saved. Generate will now register each certificate on the site.");
}

/** Removes any continuation trigger (generation or the next-day send). */
function stopScheduledRuns() {
  const removed = removeTriggers_(["continueGenerate", "continueSend"]);
  PropertiesService.getScriptProperties().deleteProperty("CONTINUE_EDITION");
  SpreadsheetApp.getUi().alert(
    removed ? `Stopped ${removed} scheduled run(s).` : "Nothing was scheduled.",
  );
}
