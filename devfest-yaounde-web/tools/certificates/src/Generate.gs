/* ---------------------------------------------------------------------------
 * 1 · Check rows   and   2 · Generate PDFs
 * ------------------------------------------------------------------------- */

/** Flags problems BEFORE anything is created or sent. Changes no status but empty → Pending. */
function checkRows() {
  const sheet = editionSheet_();
  const { map, rows } = readRows_(sheet);
  const seen = {};
  let problems = 0;
  let noEmail = 0;
  rows.forEach((r) => {
    const issues = [];
    if (!r.full_name) issues.push("no name");
    if (ROLES.indexOf(r.role) < 0) issues.push(`role must be one of ${ROLES.join(", ")}`);
    if (!r.email) {
      issues.push("no email (can be generated, not sent)");
      noEmail++;
    } else if (!EMAIL_RE.test(r.email)) {
      issues.push("invalid email");
    }
    const key = `${r.role}|${(r.email || `name:${r.full_name}`).toLowerCase()}`;
    if (seen[key]) issues.push(`duplicate of row ${seen[key]} (same person and role)`);
    else seen[key] = r._row;

    const fields = {};
    if (!r.status) fields.status = STATUS.PENDING;
    // Only the checker's own messages are replaced; real run errors stay.
    if (issues.length) fields.error = `Check: ${issues.join("; ")}`;
    else if (String(r.error).indexOf("Check:") === 0) fields.error = "";
    if (Object.keys(fields).length) writeRow_(sheet, map, r._row, fields);
    if (issues.length) problems++;
  });
  log_(sheet.getName(), "check", rows.length, rows.length - problems, problems, `${noEmail} without email`);
  alert_(
    problems
      ? `${rows.length} rows checked: ${problems} need attention (see the error column).`
      : `${rows.length} rows checked: all good.`,
  );
}

function generateCertificates() {
  runGenerate_(null, true);
}

/** Time trigger: carries on a generation that ran out of time. */
function continueGenerate() {
  removeTriggers_(["continueGenerate"]);
  const edition = PropertiesService.getScriptProperties().getProperty("CONTINUE_EDITION");
  if (edition) runGenerate_(edition, false);
}

function runGenerate_(edition, interactive) {
  const startedAt = Date.now();
  try {
    withLock_(() => {
      const sheet = editionSheet_(edition);
      const settings = readSettings_(sheet.getName());
      const { map, rows } = readRows_(sheet);

      const todo = rows.filter(
        (r) =>
          (r.status === "" || r.status === STATUS.PENDING || (r.status === STATUS.ERROR && !r.pdf_link)) &&
          r.full_name &&
          ROLES.indexOf(r.role) >= 0,
      );
      if (!todo.length) {
        if (interactive) alert_("Nothing to generate: no Pending rows with a name and a valid role.");
        return;
      }

      // The template must only use placeholders we know — checked once.
      // (Each template in use: paid tickets may have their own.)
      const checked = {};
      todo.forEach((r) => {
        const id = templateFor_(settings, r);
        if (checked[id]) return;
        checked[id] = true;
        checkTemplate_(settings, r, id);
      });

      // 1. Ids: random, allocated once, written at once, never reused. A
      // row still holding an old-style id (a running number, from a test
      // before ids became random) gets a new one: the site refuses those.
      const nextId = idAllocator_(settings.id_prefix, rows);
      todo.forEach((r) => {
        if (!CERTIFICATE_ID_RE.test(String(r.certificate_id))) {
          r.certificate_id = nextId();
          writeRow_(sheet, map, r._row, { certificate_id: r.certificate_id });
        }
      });
      SpreadsheetApp.flush();

      // 2. Register on the site first, so every QR code verifies.
      //    Test mode (Settings → site_url empty): skipped, and no QR code.
      if (settings.site_url) registerOnSite_(settings, todo);

      // 3. The PDFs.
      const root = rootFolder_(settings);
      const editionFolder = childFolder_(root, String(settings.edition));
      let ok = 0;
      let errors = 0;
      let done = 0;
      for (const r of todo) {
        if (outOfTime_(startedAt)) break;
        try {
          const folder = childFolder_(editionFolder, r.role);
          const file = makePdf_(settings, r, folder, root);
          writeRow_(sheet, map, r._row, {
            status: STATUS.GENERATED,
            generated_at: now_(),
            pdf_link: file.getUrl(),
            error: "",
          });
          ok++;
        } catch (err) {
          writeRow_(sheet, map, r._row, {
            status: STATUS.ERROR,
            error: `Generate: ${errorText_(err)}`,
            attempts: (Number(r.attempts) || 0) + 1,
          });
          errors++;
        }
        done++;
        SpreadsheetApp.flush();
      }

      const left = todo.length - done;
      if (left > 0) scheduleGenerateSoon_(settings.edition);
      log_(settings.edition, "generate", done, ok, errors, left ? `${left} left, continuing in a minute` : "");
      const summary = `Generated ${ok}, ${errors} error(s)${left ? `; ${left} left — it carries on by itself in a minute` : ""}.`;
      toast_(summary);
      if (interactive) alert_(`${summary}\n\nReview a few PDFs (pdf_link) before sending.`);
    });
  } catch (err) {
    log_(edition || "", "generate", 0, 0, 1, errorText_(err));
    if (interactive) alert_(`Stopped: ${errorText_(err)}`);
    else console.error(err);
  }
}

/**
 * Every {{placeholder}} in the template must be one we fill — otherwise a
 * certificate would print "{{something}}". `{{qr}}` is the QR box.
 */
function checkTemplate_(settings, sampleRow, templateId) {
  const deck = SlidesApp.openById(templateId);
  const values = placeholderValues_(settings, Object.assign({}, sampleRow, { certificate_id: `${settings.id_prefix}-0000-0000` }));
  values.qr = "";
  const unknown = [];
  allTexts_(deck).forEach((t) => {
    String(t.asString()).replace(PLACEHOLDER_RE, (_, name) => {
      if (!(name.toLowerCase() in values)) unknown.push(name);
      return "";
    });
  });
  if (unknown.length) {
    throw new Error(`The template uses unknown placeholders: ${[...new Set(unknown)].map((n) => `{{${n}}}`).join(", ")}`);
  }
}

/** Every text range in the deck: shapes and table cells, on every slide. */
function allTexts_(deck) {
  const out = [];
  deck.getSlides().forEach((slide) => {
    slide.getPageElements().forEach((el) => {
      const type = el.getPageElementType();
      if (type === SlidesApp.PageElementType.SHAPE) out.push(el.asShape().getText());
      if (type === SlidesApp.PageElementType.TABLE) {
        const table = el.asTable();
        for (let r = 0; r < table.getNumRows(); r++) {
          for (let c = 0; c < table.getNumColumns(); c++) out.push(table.getCell(r, c).getText());
        }
      }
    });
  });
  return out;
}

/** Copy the template, fill it, swap in the QR, export the PDF, bin the copy. */
function makePdf_(settings, row, folder, workFolder) {
  const values = placeholderValues_(settings, row);
  const copy = DriveApp.getFileById(templateFor_(settings, row)).makeCopy(`tmp ${row.certificate_id}`, workFolder);
  try {
    const deck = SlidesApp.openById(copy.getId());
    const qrShapes = [];
    const nameShapes = [];
    deck.getSlides().forEach((slide) => {
      slide.getPageElements().forEach((el) => {
        if (el.getPageElementType() !== SlidesApp.PageElementType.SHAPE) return;
        const shape = el.asShape();
        const text = shape.getText().asString();
        if (/\{\{\s*qr\s*\}\}/i.test(text)) qrShapes.push(shape);
        else if (/\{\{\s*full_name\s*\}\}/i.test(text)) nameShapes.push(shape);
      });
    });

    // Fill every text box and table cell (spaces inside {{ }} allowed).
    allTexts_(deck).forEach((range) => {
      const text = range.asString();
      if (text.indexOf("{{") < 0) return;
      const found = text.match(PLACEHOLDER_RE) || [];
      found.forEach((token) => {
        const name = token.replace(/[{}\s]/g, "").toLowerCase();
        if (name === "qr") return;
        range.replaceAllText(token, String(values[name] === undefined ? "" : values[name]));
      });
    });

    // Long names: shrink proportionally so nobody's name is cut off.
    const maxChars = Number(settings.name_max_chars) || 26;
    if (row.full_name.length > maxChars) {
      nameShapes.forEach((shape) => {
        const style = shape.getText().getTextStyle();
        const size = style.getFontSize();
        if (size) style.setFontSize(Math.max(size * 0.55, (size * maxChars) / row.full_name.length));
      });
    }

    if (qrShapes.length && settings.site_url) {
      const qr = qrBlob_(settings, row.certificate_id);
      qrShapes.forEach((shape) => shape.replaceWithImage(qr));
    } else {
      // Test mode: no QR code, and no "{{qr}}" left on the page.
      qrShapes.forEach((shape) => shape.remove());
    }
    deck.saveAndClose();

    // Same number + name keeps one file per certificate: replace on re-generate.
    const name = `${row.certificate_id} - ${row.full_name}.pdf`;
    const old = folder.getFilesByName(name);
    while (old.hasNext()) old.next().setTrashed(true);
    return folder.createFile(copy.getAs("application/pdf").setName(name));
  } finally {
    copy.setTrashed(true);
  }
}
