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
    .addItem("Create a starter template…", "createStarterTemplate")
    .addItem("Create a starter template for paid tickets…", "createPaidStarterTemplate")
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

/**
 * A plain, on-brand Slides certificate with every placeholder in place, so
 * an edition can be tested at once. Restyle it freely (keep the {{…}} and
 * the square {{qr}} box), or replace it with a designer's template.
 * Its id is written to the active edition's Settings column (template_id).
 */
function createStarterTemplate() {
  buildStarterTemplate_(false);
}

/**
 * The paid-ticket version (rows with ticket = paid): the "collector" look
 * of the DP generator's paid frames — ink background, gold type, and the
 * collector seal. Written to Settings → template_id_paid.
 */
function createPaidStarterTemplate() {
  buildStarterTemplate_(true);
}

function buildStarterTemplate_(paid) {
  const INK = "#1E1E1E";
  const GOLD = "#F9AB00";
  const PASTEL = "#FFE7A5";
  const OFFWHITE = "#F0F0F0";
  const sheet = editionSheet_();
  const edition = sheet.getName();
  const deck = SlidesApp.create(
    `DevFest Yaoundé ${edition} — certificate template${paid ? " (paid tickets)" : ""}`,
  );
  const slide = deck.getSlides()[0];
  slide.getPageElements().forEach((el) => el.remove());
  slide.getBackground().setSolidFill(paid ? INK : PASTEL);
  const W = deck.getPageWidth();
  const H = deck.getPageHeight();
  const text = paid ? OFFWHITE : INK;
  const accent = paid ? GOLD : INK;

  const box = (value, left, top, width, height, size, opts) => {
    const shape = slide.insertTextBox(value, left, top, width, height);
    const range = shape.getText();
    range
      .getTextStyle()
      .setFontFamily(opts && opts.mono ? "Google Sans Code" : "Google Sans")
      .setFontSize(size)
      .setForegroundColor((opts && opts.color) || text)
      .setBold(Boolean(opts && opts.bold));
    range
      .getParagraphStyle()
      .setParagraphAlignment(opts && opts.left ? SlidesApp.ParagraphAlignment.START : SlidesApp.ParagraphAlignment.CENTER);
    return shape;
  };

  // The brand band: ink on the regular one, gold on the paid one.
  const band = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, W, 56);
  band.getFill().setSolidFill(paid ? GOLD : INK);
  band.getBorder().setTransparent();
  const brand = band.getText();
  brand.setText("GDG YAOUNDÉ  ×  {{event_name}}");
  brand.getTextStyle().setFontFamily("Google Sans Code").setFontSize(14).setBold(true).setForegroundColor(paid ? INK : GOLD);
  brand.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  box(
    paid ? "CERTIFICAT COLLECTOR · COLLECTOR CERTIFICATE" : "CERTIFICAT · CERTIFICATE",
    40, 80, W - 80, 40, paid ? 14 : 16,
    { bold: true, mono: paid, color: accent },
  );
  box("{{full_name}}", 40, 125, W - 80, 70, 40, { bold: true, color: paid ? GOLD : INK });
  box("{{role}}", 40, 195, W - 80, 30, 18, { bold: true });
  box("Décerné {{role_line_fr}}", 40, 228, W - 80, 26, 14);
  box("Awarded {{role_line_en}}", 40, 252, W - 80, 26, 14);
  box("{{detail}}", 60, 280, W - 120, 26, 13);
  box("{{venue}} · {{event_date_fr}} · {{event_date_en}}", 40, H - 70, W - 200, 24, 12, { left: true });
  box("N° {{certificate_id}}", 40, H - 46, W - 200, 24, 12, { bold: true, left: true, mono: paid, color: accent });

  // The QR code needs a light ground: a white tile under it on the dark one.
  if (paid) {
    const tile = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, W - 138, H - 138, 116, 116);
    tile.getFill().setSolidFill("#FFFFFF");
    tile.getBorder().setTransparent();
  }
  box("{{qr}}", W - 130, H - 130, 100, 100, 10, { color: INK });

  // The collector seal, pinned over the band's corner like on the DP cards.
  if (paid) {
    const seal = Utilities.newBlob(Utilities.base64Decode(COLLECTOR_SEAL_PNG_BASE64), "image/png", "collector-seal.png");
    slide.insertImage(seal, W - 150, 14, 120, 120);
  }

  deck.saveAndClose();

  const key = paid ? "template_id_paid" : "template_id";
  const settings = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Settings");
  const values = settings.getDataRange().getValues();
  const col = values[0].map(String).indexOf(edition);
  const row = values.findIndex((r) => String(r[0]) === key);
  if (col >= 0 && row >= 0) settings.getRange(row + 1, col + 1).setValue(deck.getId());
  alert_(
    row >= 0
      ? `Starter template created and set in Settings (${edition} → ${key}):\n${deck.getUrl()}`
      : `Starter template created:\n${deck.getUrl()}\n\nSettings has no ${key} row yet: run Set up a new edition (${edition}) and paste the id there.`,
  );
}
