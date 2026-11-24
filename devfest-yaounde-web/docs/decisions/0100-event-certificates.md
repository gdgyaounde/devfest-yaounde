# 0100 — Event certificates: Google Sheet + Apps Script, verified on the site

Date: 2026-11-24
Status: Accepted

## Context

After DevFest Yaoundé 2026 the organisers want to email every checked-in attendee, speaker, volunteer and organiser a personalised PDF certificate, and to do it again every year. They live in Google Workspace and send from the free `gdgyaounde@gmail.com` account. The site already knows who was checked in, but it has no sending domain (ADR 0076): it sends no email itself.

## Decision

**Making and sending happen in Google.** The code is versioned here (`tools/certificates/`, pushed with `clasp`).
- **The sheet:** one Google Sheet with a tab per edition and a Settings tab with a column per edition.
- **The certificate:** a Google Slides template with `{{placeholders}}`.
- **The script:** an Apps Script (bound to the sheet) does four steps from a menu: **Check rows → Generate PDFs → Send a test to me → Send emails**.
  - Generate and Send are separate, so the PDFs are reviewed before anything goes out.
- **Tracking in the sheet:** each row records its status (Pending, Generated, Sent, Error, Skipped), coloured by conditional formatting; its timestamps; its PDF link; its error and attempts. A Log tab records every run.
- **Reliability:**
  - each row's failure is its own;
  - nothing is sent twice (Send only takes rows in Generated);
  - one run at a time (`LockService`);
  - runs stop at about 4.5 minutes and continue through a trigger;
  - when Gmail's daily quota (about 100 on a free account) runs out, a daily trigger resumes at 08:00 and removes itself when done.
- **One set of placeholders** fills the certificate, the subject, and the HTML and plain-text email. An unknown placeholder is an error, never printed as `{{…}}`.
- **One certificate per role:** one row = one certificate.

**The site verifies, and helps fill the sheet:**
- **The certificate record.** Migration 0048 creates `certificates` (id, edition, name, role, detail, issued/revoked). It holds **no email**, with RLS on and no policies.
- **Registering.** `POST /api/certificates/issue` is called by the script when it generates, before making the PDF. It is authenticated with a shared secret (`CERTIFICATES_SECRET`, compared in constant time) and validated with a strict schema that has no field for an email. Re-issuing keeps the first issue date and never clears a revocation.
- **The QR code.** `GET /api/certificates/<id>/qr` returns a PNG of the verify URL, built with the existing `qrcode` library. It is pure computation, cached forever and not rate-limited, because one Google server fetches hundreds in a row. The script puts it in place of the template's `{{qr}}` box.
- **The verify page.** `/[locale]/certificates/<id>` is public, in both languages and not indexed. Looking up an exact id shows genuine, revoked or not found. There's no list and no search.
- **The dashboard.** Dashboard → Certificates:
  - **Download the list** (organisers only, audited): checked-in tickets and reservations, volunteers, arrived speakers and the team, in the sheet's columns, one row per (person, role);
  - the issued certificates, with **revoke and restore**.

**Test mode:** an empty `site_url` in Settings skips registration and the QR code, so the layout and emails can be tried on a personal account before the site is ready.

## Consequences

- Certificate ids (`DFY26-K7QM-4XHT`) are the edition's prefix plus a **random** key of eight Crockford base32 characters (no I, L, O or U). They are not a running number, which would let anyone walk `-0001`, `-0002`, … on the verify page and list every holder's name. An id is allocated once in the sheet and never reused. Resetting a row keeps it, so a printed QR code stays valid.
- Speakers' and organisers' emails, and the Bevy free passes (from a full-email Bevy export), are added to the sheet by hand. The site holds none of these.
- The free Gmail quota means about 160 certificates go out over two days. A Workspace sender would do it in one.
- A future second channel (for example sending from the site once a domain exists) can reuse the same `certificates` records and verify page.
- Tests:
  - `tests/certificates.test.ts` (ids, schema, secret, list);
  - `tests/certificates-script.test.ts` (the script's helpers, run in a sandbox, plus both email templates);
  - `tests/db/certificates.db.ts` (0048 on PGlite).
