# 0076 — Manual email sends until a sending domain exists

Date: 2026-11-15
Status: Accepted

## Context

Launch week needs one message to everyone with a ticket and one to every
free-pass RSVP: the event is one day (ADR 0071), sales close Wednesday
(ADR 0072), food/swag/identifiers are paid perks (ADR 0074), holders can fix
their size and name (ADR 0075), and paid holders get collector DP frames.

The site's only mail path is Resend (`src/lib/email/send.ts`). **Resend only
sends from a verified domain**; without `EMAIL_FROM` set, the sender falls
back to `onboarding@resend.dev`, Resend's shared sandbox, which **only
delivers to the Resend account owner's own address**. The chapter has no
email domain of its own yet. Free-pass RSVPs live only on Bevy — the site
has no addresses for them at all.

## Decision

**The site sends nothing for this.** It builds the messages and the list;
an organiser sends them by hand.

- `renderLaunchUpdate({ audience: "paid" | "free" })` in
  `src/lib/email/templates.ts`: one self-contained email per audience,
  French then English, on the shared `layout()`/`button()` — tables, inline
  styles, 600px, web-safe fonts, absolute https links and logo, no JS, no
  external CSS, no placeholders left — plus a plain-text version.
- `npm run emails:render` writes them to
  `docs/content/emails/launch-update-2026-11.{paid,free}.{html,txt}`,
  committed so they can be
  downloaded from GitHub. A test fails if the committed files and the
  renderer drift.
- **Admin → Emails** (organiser-only): previews each template as sent,
  Download .html / Copy HTML / Copy plain text / Copy subject, and a "How to
  send" panel (BCC only, batches of ≤ 90, Gmail's ~500/day personal and
  ~2,000/day Workspace limits, Bevy messaging for free passes).
- **Recipients CSV** for the `paid` audience only, from
  `GET /api/admin/emails/recipients?format=csv`: the lower-cased,
  de-duplicated union of ticket attendee emails, the contact email on
  activated **ticket** intents (shop-only buyers are not "paid holders"), and
  `profiles.email` — columns `email, name, source, locale`. Organiser-only
  (404 otherwise), rate-limited, `Cache-Control: no-store`, CSV-injection-safe,
  and every export is written to the admin audit log (counts only, never the
  addresses). `?format=json` returns counts for the page. No static file,
  no public route, nothing in the repo.
- No send button, no Resend batch sender, no broadcast tables.

### Transactional mail today (read-only check, 2026-11-15)

`payment_events` holds **13 `receipt_sent`** (latest 2026-11-14) for **13
activated payments**, and no `receipt_failed`, `receipt_skipped` or
`claim_email_*` rows. `sendEmail` logs a non-2xx Resend response as
`failed`, and the sandbox sender refuses any recipient but the account owner
— so production is evidently configured with an `EMAIL_FROM` Resend
accepts. What this cannot show is the Vercel value itself or inbox placement
(spam folder vs inbox): check the Resend dashboard's sending domain and
delivery log to be sure. If `EMAIL_FROM` is in fact the sandbox, every
receipt and claim email to anyone but the owner is being refused — and that
would be visible there.

## Consequences

- Sending is a person's afternoon, not a button: batches, BCC, limits.
- Once a domain is verified in Resend, a proper broadcast (with
  unsubscribe handling) becomes possible — a separate decision.
- The `paid` copy thanks people "for getting a pass"; site users with no
  ticket are in the list by the brief's choice — their `source` is
  `profile`, so they can be filtered out of the CSV before sending.
- The paid email announces collector DP frames: send it only after Part F
  (ADR 0077) is live.
