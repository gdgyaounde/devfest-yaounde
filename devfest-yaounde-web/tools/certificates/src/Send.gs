/* ---------------------------------------------------------------------------
 * 3 · Send a test   4 · Send emails   · Retry · Reset
 * ------------------------------------------------------------------------- */

function sendCertificates() {
  runSend_(null, true);
}

/** Daily trigger: carries on sending once Gmail's quota is back. */
function continueSend() {
  const edition = PropertiesService.getScriptProperties().getProperty("CONTINUE_EDITION");
  if (edition) runSend_(edition, false);
  else removeTriggers_(["continueSend"]);
}

/** Today's sends against `daily_cap` (testing aid), per edition and day. */
function sentTodayKey_(edition) {
  return `SENT_${edition}_${Utilities.formatDate(new Date(), "Africa/Douala", "yyyy-MM-dd")}`;
}

function runSend_(edition, interactive) {
  const startedAt = Date.now();
  try {
    withLock_(() => {
      const sheet = editionSheet_(edition);
      const settings = readSettings_(sheet.getName());
      const { map, rows } = readRows_(sheet);
      const todo = rows.filter((r) => r.status === STATUS.GENERATED && r.pdf_link);
      if (!todo.length) {
        removeTriggers_(["continueSend"]);
        if (interactive) alert_("Nothing to send: no Generated rows. Generate first.");
        return;
      }

      const props = PropertiesService.getScriptProperties();
      const key = sentTodayKey_(settings.edition);
      const sentToday = Number(props.getProperty(key)) || 0;
      const cap = Number(settings.daily_cap) || Infinity;
      let allowance = Math.min(MailApp.getRemainingDailyQuota(), cap - sentToday);

      let ok = 0;
      let errors = 0;
      for (const r of todo) {
        if (allowance <= 0 || outOfTime_(startedAt)) break;
        if (!EMAIL_RE.test(r.email)) {
          writeRow_(sheet, map, r._row, {
            status: STATUS.ERROR,
            error: r.email ? "Send: invalid email" : "Send: no email",
            attempts: (Number(r.attempts) || 0) + 1,
          });
          errors++;
          continue;
        }
        try {
          const email = buildEmail_(settings, r);
          MailApp.sendEmail({
            to: r.email,
            subject: email.subject,
            body: email.text,
            htmlBody: email.html,
            attachments: [pdfBlob_(r.pdf_link)],
            name: settings.sender_name,
            replyTo: settings.reply_to || undefined,
          });
          writeRow_(sheet, map, r._row, { status: STATUS.SENT, sent_at: now_(), error: "" });
          ok++;
          allowance--;
          props.setProperty(key, String(sentToday + ok));
        } catch (err) {
          writeRow_(sheet, map, r._row, {
            status: STATUS.ERROR,
            error: `Send: ${errorText_(err)}`,
            attempts: (Number(r.attempts) || 0) + 1,
          });
          errors++;
        }
        SpreadsheetApp.flush();
      }

      const left = todo.length - ok - errors;
      let note = "";
      if (left > 0 && allowance <= 0) {
        scheduleSendTomorrow_(settings.edition);
        note = `${left} left — daily email limit reached, resumes tomorrow at 08:00`;
      } else if (left > 0) {
        scheduleGenerateSoonForSend_(settings.edition);
        note = `${left} left — continuing in a minute`;
      } else {
        removeTriggers_(["continueSend"]);
      }
      log_(settings.edition, "send", ok + errors, ok, errors, note);
      const summary = `Sent ${ok}, ${errors} error(s)${note ? `; ${note}` : ""}.`;
      toast_(summary);
      if (interactive) alert_(summary);
    });
  } catch (err) {
    log_(edition || "", "send", 0, 0, 1, errorText_(err));
    if (interactive) alert_(`Stopped: ${errorText_(err)}`);
    else console.error(err);
  }
}

/** Out of TIME (not quota): carry on in a minute, like generation does. */
function scheduleGenerateSoonForSend_(edition) {
  removeTriggers_(["continueSend"]);
  PropertiesService.getScriptProperties().setProperty("CONTINUE_EDITION", String(edition));
  ScriptApp.newTrigger("continueSend").timeBased().after(60 * 1000).create();
}

/** The real email and PDF for the selected row — to you only. No status change. */
function sendTestToMe() {
  try {
    const sheet = editionSheet_();
    const settings = readSettings_(sheet.getName());
    const { rows } = readRows_(sheet);
    const rowNumber = sheet.getActiveRange().getRow();
    const r = rows.find((x) => x._row === rowNumber);
    if (!r) throw new Error("Select a row with a person on it.");
    if (!r.pdf_link) throw new Error("That row has no PDF yet — Generate first.");
    const me = Session.getEffectiveUser().getEmail();
    const email = buildEmail_(settings, r);
    MailApp.sendEmail({
      to: me,
      subject: `[TEST] ${email.subject}`,
      body: email.text,
      htmlBody: email.html,
      attachments: [pdfBlob_(r.pdf_link)],
      name: settings.sender_name,
      replyTo: settings.reply_to || undefined,
    });
    log_(settings.edition, "test", 1, 1, 0, `row ${rowNumber} → ${me}`);
    alert_(`Test sent to ${me} (row ${rowNumber}). Check it on a phone and with images off.`);
  } catch (err) {
    alert_(`Test not sent: ${errorText_(err)}`);
  }
}

/** Error rows go back to where they can be retried. */
function retryErrors() {
  const sheet = editionSheet_();
  const { map, rows } = readRows_(sheet);
  let n = 0;
  rows
    .filter((r) => r.status === STATUS.ERROR)
    .forEach((r) => {
      writeRow_(sheet, map, r._row, {
        status: r.pdf_link ? STATUS.GENERATED : STATUS.PENDING,
        error: "",
      });
      n++;
    });
  log_(sheet.getName(), "retry", n, n, 0, "");
  alert_(n ? `${n} row(s) ready to retry: run Generate and/or Send again.` : "No errors to retry.");
}

/** Back to Pending (keeps the certificate number, so the QR stays valid). */
function resetSelectedRows() {
  const ui = SpreadsheetApp.getUi();
  const sheet = editionSheet_();
  const { map, rows } = readRows_(sheet);
  const range = sheet.getActiveRange();
  const first = range.getRow();
  const last = first + range.getNumRows() - 1;
  const picked = rows.filter((r) => r._row >= first && r._row <= last);
  if (!picked.length) {
    ui.alert("Select the rows to reset first.");
    return;
  }
  const sent = picked.filter((r) => r.status === STATUS.SENT).length;
  const ok = ui.alert(
    "Reset rows",
    `Reset ${picked.length} row(s) to Pending?${sent ? `\n\n${sent} were already SENT: they would be sent again.` : ""}`,
    ui.ButtonSet.YES_NO,
  );
  if (ok !== ui.Button.YES) return;
  picked.forEach((r) =>
    writeRow_(sheet, map, r._row, {
      status: STATUS.PENDING,
      generated_at: "",
      sent_at: "",
      pdf_link: "",
      error: "",
      attempts: "",
    }),
  );
  log_(sheet.getName(), "reset", picked.length, picked.length, 0, `rows ${first}-${last}`);
}

/** The subject, HTML and plain text, from the same placeholders. */
function buildEmail_(settings, row) {
  const values = placeholderValues_(settings, row);
  const html = HtmlService.createHtmlOutputFromFile("email").getContent();
  const text = HtmlService.createHtmlOutputFromFile("email_text").getContent();
  return {
    subject: fill_(settings.email_subject, values),
    html: fill_(html, values, true),
    text: fill_(text, values),
  };
}

function pdfBlob_(link) {
  const m = /\/d\/([a-zA-Z0-9_-]+)/.exec(String(link)) || /[?&]id=([a-zA-Z0-9_-]+)/.exec(String(link));
  if (!m) throw new Error("pdf_link isn't a Drive file link");
  return DriveApp.getFileById(m[1]).getBlob();
}
