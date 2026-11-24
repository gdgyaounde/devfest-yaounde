# Event certificates — Google Sheet + Apps Script

Makes and emails a personalised PDF certificate to everyone who was at DevFest Yaoundé: attendees, speakers, volunteers, organisers and partners. Each certificate carries a number and a QR code that anyone can check on the site (`/certificates/<number>`). See ADR 0100.

```
Site dashboard → Certificates → "Download the list" (CSV)
        ↓ paste
Google Sheet (one tab per edition)  —  menu "Certificates"
        ↓ Generate                         ↓ Send
Slides template → PDF in Drive        Gmail: HTML email + PDF attached
        ↓ registers the number on the site, so the QR code verifies
```

The code here is the source of truth. Edit it in the repo and push it with `clasp`, never in the browser editor (your changes there would be overwritten).

---

## One-time setup (per Google account)

1. **Turn on the Apps Script API** for the account: <https://script.google.com/home/usersettings>.
2. **Sign in** from this folder (opens a browser):
   ```bash
   cd tools/certificates
   npx @google/clasp@2.4.2 login
   ```
3. **Create the sheet and its script** (a new Google Sheet with the script attached):
   ```bash
   npx @google/clasp@2.4.2 create --type sheets --title "DevFest Yaoundé — Certificates" --rootDir src
   npx @google/clasp@2.4.2 push --force
   npx @google/clasp@2.4.2 open --addon   # opens the sheet
   ```
   `create` writes `.clasp.json` (which project this folder pushes to). It is git-ignored because it's per account. To push to an existing sheet instead, create `.clasp.json` by hand: `{ "scriptId": "<from Extensions → Apps Script → Project settings>", "rootDir": "src" }`.
4. In the sheet, reload. Use **Certificates → Set up a new edition…** and type `2026`. This creates the **Settings**, **Log** and **2026** tabs with headers, dropdowns and colours.
5. **Certificates → Connect to the site (secret)…**: paste `CERTIFICATES_SECRET`. It's the same value as on Vercel, and it's stored in the script's properties, never in the sheet.
6. The first run asks for permissions: Sheets, Slides, Drive, sending email as you, and calling the site. Accept.

**Test mode:** leave Settings → `site_url` **empty** to try everything (layout, names, emails to yourself) before the site is ready. Nothing is registered, and certificates have no QR code. Fill `site_url` back in for the real run.

For the real sends, do this with the **gdgyaounde@gmail.com** account, because emails go out from the account that runs the script.

---

## The Slides template

**Quickest start:** open the edition tab and use **Certificates → Create a starter template…**. It makes a plain, on-brand certificate with every placeholder in place, and puts its ID in Settings. Restyle it freely; keep the `{{…}}` and the square `{{qr}}` box.

Or make your own Google Slides deck (landscape) that looks like the final certificate, and put its ID in Settings → `template_id`. The ID is the long part of its URL between `/d/` and `/edit`. Type these placeholders anywhere in text boxes; spaces inside are fine (`{{ full_name }}`):

| Placeholder | Becomes |
|---|---|
| `{{full_name}}` | Ada Lovelace. Long names shrink automatically (Settings → `name_max_chars`). |
| `{{first_name}}` | Ada |
| `{{role}}` | Speaker: one label per role, set in Settings (`role_attendee`, `role_speaker`, …). Write it in your template's language. |
| `{{role_line_fr}}` / `{{role_line_en}}` | "pour son intervention au DevFest Yaoundé 2026" (Settings → `line_*`) |
| `{{detail}}` | the talk title (speakers), the team role (organisers), or empty |
| `{{event_name}}`, `{{event_date_fr}}`, `{{event_date_en}}`, `{{venue}}`, `{{edition}}` | from Settings |
| `{{certificate_id}}` | DFY26-0042 |
| `{{verify_url}}` | https://devfest.gdgyaounde.com/certificates/DFY26-0042 |
| `{{qr}}` | **a square text box containing only `{{qr}}`**: it's replaced by the QR code image, at the box's size |

An unknown placeholder (a typo like `{{fullname}}`) stops generation with a clear message. It never ends up printed on a certificate.

---

## Each edition

1. **The list.** Dashboard → Certificates → **Download the list**. It covers checked-in tickets and reservations, volunteers, speakers marked as arrived, and the team. Paste it under the headers of the edition tab.
   - Add the **emails** for speakers and organisers; the site doesn't hold them.
   - Add the **Bevy check-ins** (free passes) from Bevy's attendee export, with full emails and the role `attendee`.
   - One row = one certificate. Someone who spoke AND organised gets two rows.
2. **Settings column**: fill `event_date_fr`, `event_date_en` and `template_id`. Check the role lines.
3. Menu **1 · Check rows**: missing or invalid emails, duplicates, unknown roles. Fix the rows it flags in the `error` column.
4. Menu **2 · Generate PDFs**:
   - each row gets a number, is registered on the site, and gets its PDF in Drive (`<folder>/2026/<role>/`);
   - its status becomes **Generated** and `pdf_link` points to the file;
   - **open a few PDFs and check them**, and scan a QR code with your phone.
5. Menu **3 · Send a test to me** on a row: the real email and PDF, to you only. Check it on a phone, in dark mode, with images off.
6. Menu **4 · Send emails**: each row becomes **Sent**, with `sent_at` filled in.

**Statuses** (coloured automatically):

| Status | Colour | Meaning |
|---|---|---|
| Pending | grey | to generate |
| Generated | blue | PDF made, to send |
| Sent | green | emailed |
| Error | red | see the `error` column |
| Skipped | amber | set it yourself to leave someone out |

- **Retry errors**: puts Error rows back to Generated (if they have a PDF) or Pending, so you can run the step again.
- **Reset selected rows**: back to Pending. It keeps the number, so a QR code already printed stays valid.
- **The Log tab** records every run: who ran it, when, how many, and any errors.

**Fixing a name after sending:** correct it in the sheet, use Reset selected rows on that person, then Generate and Send again. Same number, new PDF; the site updates the name.

**Withdrawing a certificate:** Dashboard → Certificates → Revoke. The QR page then says it's no longer valid.

---

## Limits and how the script copes

- **Gmail's daily limit**: about **100 emails a day** from a free Gmail account, about 1,500 from Google Workspace. When the limit is reached, sending stops cleanly, the Log says how many are left, and it **resumes by itself the next day at 08:00**. Use **Stop scheduled runs** to cancel.
- **6 minutes per run**: long generations or sends stop at about 4.5 minutes and carry on by themselves a minute later.
- **One run at a time**: a second click waits or says another run is in progress.
- **Nothing is sent twice**: Send only takes rows in Generated.
- To test the next-day resume, set Settings → `daily_cap` to `2`, send, and look at the Log and at Extensions → Apps Script → Triggers.

## Next year

- **Same spreadsheet**: Certificates → Set up a new edition… → `2027`. That's a new tab plus a new Settings column (set `id_prefix` to `DFY27`). Earlier years stay untouched in their tabs.
- **Or** File → Make a copy. Then redo step 5 of the one-time setup (connect to the site), because script properties don't copy.

## Privacy

- **The sheet and the Drive folder hold personal data** (names, emails): share them with organisers only, never "anyone with the link".
- **What the site receives**: only the name, role, edition and detail (what's printed on the certificate), never an email.
- **After the edition**: delete the exported CSVs, and decide how long to keep the PDFs.
