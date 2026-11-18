# Documentation

Start from what you are trying to do.

| I want to…                                         | Read                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Build the ticket / shop / DP generator screens** | [`guides/frontend-integration.md`](guides/frontend-integration.md) — every endpoint, request and response shape                |
| **Know what is left to do**                        | [`setup/remaining-work.md`](setup/remaining-work.md) — what blocks a real sale, what is missing, what was deliberately skipped |
| **Deploy, or set an environment variable**         | [`setup/deployment.md`](setup/deployment.md) — which secret lives where, and why                                               |
| **Run the site locally**                           | [`setup/local-development.md`](setup/local-development.md)                                                                     |
| **Understand or debug payments**                   | [`guides/payments-runbook.md`](guides/payments-runbook.md) — how a payment settles, and what to do when one looks wrong        |
| **Change ticket prices, tiers or shop products**   | [`guides/updating-tickets-and-shop.md`](guides/updating-tickets-and-shop.md) — file edits, no developer needed                 |
| **Change speakers, sessions, FAQs, team**          | [`guides/updating-content.md`](guides/updating-content.md)                                                                     |
| **Change the DP generator's frames**               | [`guides/dp-generator.md`](guides/dp-generator.md) — the frame catalog, and why it has no backend                              |
| **Fix how a link previews, or a search result**    | [`guides/seo.md`](guides/seo.md) — metadata, hreflang, the social image, structured data                                       |
| **Scan a badge, or move an order along**           | [`guides/check-in-and-orders.md`](guides/check-in-and-orders.md)                                                               |
| **Get into the admin dashboard**                   | [`guides/admin-dashboard.md`](guides/admin-dashboard.md) — the URL, the env vars, and the `organisers` row                     |
| **Know how something should look or move**         | [`design/DESIGN.md`](design/DESIGN.md), [`content/PAGES.md`](content/PAGES.md)                                                 |
| **Check a release**                                | [`setup/security-checklist.md`](setup/security-checklist.md)                                                                   |
| **See the last accessibility/performance audit**   | [`audits/a11y-performance-2026-09-16.md`](audits/a11y-performance-2026-09-16.md)                                               |

---

## The five things worth knowing before touching payments

1. **Prices never come from the client.** Every total is recomputed
   server-side from `src/data/*.json` by id. A `priceXAF` in a request body is
   ignored.
2. **We ask PawaPay; we are never told.** There is no callback in this flow —
   settlement happens by polling and by a five-minute sweep from Supabase
   `pg_cron` (ADR 0028). `CRON_SECRET` is therefore load-bearing, not optional.
3. **Delivery is one guarded transaction.** `apply_paid_deposit` claims the
   intent `FOR UPDATE` behind a `status = 'pending'` guard, so any number of
   concurrent callers deliver exactly once.
4. **Access control lives in the database.** RLS scopes every read to
   `auth.uid()`. Hiding a button is not access control.
5. **`BADGE_CODE_SECRET` must never change.** Every badge code derives from
   it; rotating it invalidates every ticket already sold.

---

## Decision records

Numbered, never reused. Read the newest on a topic first — several supersede
or amend an earlier one.

**Payments and commerce**

| #                                                                       | Subject                                                                                                         | Status                                                  |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [0003](decisions/0003-payments-and-auth.md)                             | Payments & auth provider                                                                                        | Superseded by 0013 / 0014                               |
| [0013](decisions/0013-payments-pawapay.md)                              | PawaPay, Mobile Money                                                                                           | Accepted, **amended by 0019**                           |
| [0014](decisions/0014-persistence-and-auth-supabase.md)                 | Supabase, Google-only sign-in                                                                                   | Accepted                                                |
| [0016](decisions/0016-capacity-reservations.md)                         | Capacity & discount reservations                                                                                | Accepted                                                |
| [0017](decisions/0017-pawapay-token-from-ssm.md)                        | Token from AWS SSM                                                                                              | Accepted, **not the default — see 0018**                |
| [0018](decisions/0018-secrets-in-supabase-vault.md)                     | Supabase Vault as secret store                                                                                  | Accepted — **current default**                          |
| [0019](decisions/0019-settle-by-polling-not-callback.md)                | Settle by polling, not callback                                                                                 | Accepted, **amended by 0028**                           |
| [0028](decisions/0028-cleanup-sweep-from-supabase.md)                   | Sweep invoked by Supabase cron                                                                                  | Accepted — **Hobby cannot use Vercel `*/5`**            |
| [0029](decisions/0029-editorial-content-store.md)                       | Editorial content has no writable store                                                                         | **Accepted by 0031**                                    |
| [0031](decisions/0031-editorial-store-in-postgres.md)                   | Postgres store, JSON fallback                                                                                   | Accepted, **amended by 0032**                           |
| [0032](decisions/0032-editorial-photo-upload.md)                        | Photos attached per profile after sheet                                                                         | Accepted                                                |
| [0030](decisions/0030-wall-page-and-what-it-shows.md)                   | What the community wall shows                                                                                   | Accepted, **amended by 0033**                           |
| [0033](decisions/0033-community-wall-is-on.md)                          | Wall on; visitors can report a card                                                                             | Accepted — closes G21                                   |
| [0034](decisions/0034-dp-save-on-action.md)                             | Download/share/copy saves the card                                                                              | Accepted — **supersedes 0015**                          |
| [0035](decisions/0035-chartjs-admin-overview.md)                        | Chart.js on the admin overview                                                                                  | Accepted                                                |
| [0036](decisions/0036-discount-preview-before-payment.md)               | Show the discount before the payment page                                                                       | Accepted — **reverses G4**                              |
| [0037](decisions/0037-wall-stores-webp.md)                              | The wall stores WebP, keeping card corners                                                                      | Accepted — supersedes the flatten fix                   |
| [0038](decisions/0038-event-dates-and-call-config.md)                   | Two dates a week apart; the calls are config                                                                    | Accepted — **fixes the day-2 date**                     |
| [0039](decisions/0039-call-for-speakers-as-a-state.md)                  | The call for speakers is a state, not a page                                                                    | Accepted                                                |
| [0040](decisions/0040-participation-terms-and-open-seats.md)            | Participation terms, and a sponsor strip that shows its empty seats                                             | Accepted — **supersedes the CoC placeholder in 0038**   |
| [0041](decisions/0041-hero-weight-and-the-preloader-handoff.md)         | A lighter hero, and a splash that hands over                                                                    | Accepted — **fixes the date in the ticket email**       |
| [0042](decisions/0042-admin-saves-reach-the-site.md)                    | Admin saves reach the site; the Save button exists                                                              | Accepted — **fixes four reported defects**              |
| [0043](decisions/0043-admin-forms-and-navigation.md)                    | Photos before save, filters, accordion sidebar                                                                  | Accepted                                                |
| [0044](decisions/0044-hero-bottom-anchored-wordmark.md)                 | A bottom-anchored wordmark and floating facts                                                                   | Accepted — **replaces the hero in 0041**                |
| [0045](decisions/0045-hero-weight-overlap-and-recede.md)                | Bolder, left-anchored, overlapping, reactive to leaving                                                         | Accepted — **tunes 0044**                               |
| [0046](decisions/0046-hero-bar-chart-wordmark-and-stickers.md)          | Bar-chart wordmark, sticker cluster, photo backdrop                                                             | Accepted — **replaces the hero in 0044/0045**           |
| [0047](decisions/0047-hero-random-stickers-and-admin-backdrop.md)       | Re-rolling sticker scatter, year pill, backdrop from the dashboard                                              | Accepted — extends 0046                                 |
| [0048](decisions/0048-settings-revalidation-was-a-documented-misuse.md) | Settings revalidation was a documented `revalidatePath` misuse                                                  | Accepted — **corrects 0042**                            |
| [0053](decisions/0053-remove-lenis-momentum-scroll.md)                  | Removing Lenis outright, not disabling it                                                                       | Accepted — **supersedes 0007**                          |
| [0054](decisions/0054-swag-references-shop-products.md)                 | Swag references shop products; it does not create them                                                          | Accepted — **supersedes 0050**                          |
| [0055](decisions/0055-row-level-publish-and-published-first.md)         | Publish/hide from the row, and published work first                                                             | Accepted                                                |
| [0056](decisions/0056-gallery-link-and-testimonials.md)                 | An editable gallery link, testimonials in the store, flat stickers                                              | Accepted — **fixes a settings-read hazard**             |
| [0057](decisions/0057-interactive-figures.md)                           | Figures that roll in, and a cursor that becomes a picture                                                       | Accepted                                                |
| [0058](decisions/0058-post-event-gallery-and-more-quote-stickers.md)    | Post-event gallery CTA, a timezone fix, and a 4th testimonial sticker                                           | Accepted — **extends 0056**                             |
| [0059](decisions/0059-stat-figure-polish-and-real-testimonials.md)      | Bigger, uncropped stat figures with alternating tilt; testimonials with voice                                   | Accepted — **extends 0057**                             |
| [0060](decisions/0060-sponsor-overhaul-and-memory-lane-uploads.md)      | Alpha upload bug, sponsor cursor popup + spotlight, tier rename, Memory Lane admin                              | Accepted                                                |
| [0061](decisions/0061-faq-and-testimonials-content.md)                  | Real FAQ content, four more role-attributed testimonials, a visible contact line                                | Accepted                                                |
| [0062](decisions/0062-ticket-claim-and-email-provider.md)               | Self-service ticket claim by email + Google sign-in; Resend closed out as the email provider                    | Accepted                                                |
| [0063](decisions/0063-transaction-fee.md)                               | A 1.5% transaction fee, computed at display/checkout time, base price never stored with it                      | Accepted                                                |
| [0064](decisions/0064-refund-exchange-tracker.md)                       | A visibility tracker for manual refund/exchange requests; consent recording was already done (0022)             | Accepted                                                |
| [0065](decisions/0065-admin-bulk-actions.md)                            | Bulk publish/hide/delete, retrofit onto every admin list at once                                                | Accepted — **extends 0052**                             |
| [0066](decisions/0066-installable-pwa-offline-schedule.md)              | Installable PWA; offline caching limited by name to Schedule/Speakers/Team/FAQs; fixes a silent /apple-icon 404 | Accepted                                                |
| [0067](decisions/0067-a11y-audit-fixes.md)                              | `-ink` colour tokens, a lightened Red primary, and a skip link that actually moves focus                        | Accepted                                                |
| [0068](decisions/0068-round-up-to-nearest-50.md)                        | Fee-inclusive prices round UP to the next 50 XAF: `ceil(base × 1.015 / 50) × 50`                                | Accepted — **amends the rounding rule in 0063**         |
| [0069](decisions/0069-admin-role-management.md)                         | Promote/remove admins from Users; the last-admin rule, actor re-check and audit live in Postgres                | Accepted — **apply migration 0026 first**               |
| [0070](decisions/0070-ticket-only-products-and-nav-tabs.md)             | Ticket-only products (swag that is never sold), hideable navbar tabs, free-tier swag, FAQ "no answer" CTA       | Accepted — **apply migration 0027 to save nav changes** |

**Site and design**

[0001](decisions/0001-initial-scaffold.md) archive & clean start ·
[0002](decisions/0002-tech-stack.md) tech stack ·
[0004](decisions/0004-font-loading.md) fonts ·
[0005](decisions/0005-base-color-theme.md) base theme ·
[0006](decisions/0006-logo-assets.md) logo ·
[0007](decisions/0007-smooth-scroll.md) smooth scroll (superseded by 0053) ·
[0008](decisions/0008-retire-bevy-rsvp.md) Bevy RSVP retired ·
[0009](decisions/0009-speaker-interaction.md) speaker interaction ·
[0010](decisions/0010-team-grouping.md) team grouping ·
[0011](decisions/0011-runtime-theming.md) runtime theming ·
[0012](decisions/0012-overlay-reuse.md) overlay reuse ·
[0015](decisions/0015-dp-generator-client-side.md) DP generator client-side (superseded by 0034)

---

## Writing docs here

Covered by `.claude/skills/devfest-docs-workflow`. Short version: an
architectural choice gets a numbered decision record; a feature a future
organiser has to operate gets a guide written for them, not for a developer.

When a record stops being true, **annotate it — do not rewrite it**. The point
of a decision record is that it says what was decided and why _at the time_.
Add a `Superseded by` / `Amended by` line at the top and strike the specific
claims that changed, as `0013` and `0017` do.
