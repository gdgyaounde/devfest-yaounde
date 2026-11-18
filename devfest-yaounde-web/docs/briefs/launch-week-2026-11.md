# Launch-week brief — one day, sales close, speakers, terms, collector frames

Written 2026-11-15. Today is Sunday; **ticket sales and ticket edits close Wednesday
18 Nov 2026 at 23:59 Africa/Douala (2026-11-18T23:59:00+01:00)**. DevFest Yaoundé 2026 is
now **one day: Saturday 21 Nov 2026**.

Work in **six parts, in this order**. Each part gets its own branch and commits. **Stop after
each part for the organiser's review**; don't start the next one without a go-ahead.
Parts A and D are the most urgent because they must be live well before Wednesday.

## Ground rules (read first)

- Repo root for the app: `devfest-yaounde-web/`. Read `AGENTS.md`: this Next.js version
  differs from training data, so check `node_modules/next/dist/docs/` before using an API.
- Load the project skills before touching their areas: `devfest-content-model`,
  `devfest-i18n`, `devfest-design-system`, `devfest-brand-voice`, `devfest-security`,
  `devfest-animation`, `devfest-docs-workflow`.
- **Every user-facing string is bilingual** (fr default, en) in `messages/{fr,en}.json` or
  in `{fr,en}` content fields.
- Design rules are hard: yellow base theme, **zero gradients**, no abstract decorative
  circles, and boldness and motion per DESIGN.md §7b/§7c. Reuse `ui/Modal.tsx`,
  `ui/Toast.tsx` and the motion presets; don't hand-roll new ones.
- **The production database is read-only for you.** `.env.local` holds service-role keys for the
  LIVE Supabase project.
  - Read-only queries (audits, dry runs) are fine. Never insert, update or delete.
  - Schema and data changes ship as files in `supabase/migrations/` (next number after
    `0027`). Each one gets a deploy-order note. The organiser's team applies them **after** the
    code deploys.
  - Code must therefore work when a new column or row **does not exist yet**. Fall back to repo
    defaults, the same way `src/lib/content/settings.ts` merges defaults today.
- Content overrides: speakers, sessions, FAQs and ticket tiers are read from the
  `editorial_documents` row when one exists, otherwise from `src/data/*.json`
  (`src/lib/content/store.ts`). For each one you change, **check read-only whether the DB row
  exists**.
  - If it does, the JSON edit alone changes nothing live. Ship a migration that upserts the new
    array, or tell the organiser exactly what to re-import from the admin. Say which you chose.
- Docs as you go: add an ADR (`docs/decisions/NNNN-…`, next after 0070) for every
  structural choice, and update the matching guide in `docs/guides/`.
- Git: branch from a freshly synced `upstream/main`. Push each finished branch to **both**
  `origin` and `upstream`; the organiser opens the PR from `upstream/<branch>`. End each
  commit with the Co-Authored-By line from your system instructions.
- Verify in the real app (`npm run dev`, puppeteer screenshots fr + en, mobile + desktop),
  plus `npm run lint`, `npm run typecheck` (or `tsc --noEmit`) and the test suite, before
  every review stop.

### One shared setting: the ticketing cutoff

Parts A and C both read one instant.

- Add a `ticketing` group to settings: `{ salesCloseAt: string; editsCloseAt: string }`.
- Model it on `cfs.closesAt` (`instantOrEmpty` in `src/lib/content/schemas.ts:335-348`).
- Repo default for both: `"2026-11-18T23:59:00+01:00"`, in `src/lib/site-config.ts`.
- Add a `site_settings.ticketing jsonb` migration, following the pattern of `0027_nav_tab_visibility.sql`.
- Make it editable in `AdminConfig.tsx`.
- Add helpers next to `eventHasEnded()` in `src/lib/event.ts`: `ticketSalesOpen(now, settings)`
  and `ticketEditsOpen(now, settings)`.
- Unit-test them, including the boundary minute and the timezone.

---

## Part A — One day only + "sales close Wednesday"  (branch `feat/one-day-and-sales-close`)

### A1. One day

- In `src/lib/calendar.ts`, set `EVENT_DATES = ["2026-11-21"]`.
- Everything derived updates on its own: hero date parts, `formatEventDates`, the OG image, the
  emails, the JSON-LD (single day = no `subEvent`), `EVENT.days`, `eventHasEnded`, and the
  admin day pickers. Check each of these.
- Rewrite the copy that says two days, in **both** languages:
  - `messages/*.json`: hero `tagline` (~:120, "Two Saturdays…/Deux samedis…"),
    `home.metaDesc` (~:203), `pages.schedule.lead` (~:209), `pages.schedule.metaDesc` (~:210).
  - `src/data/faqs.json:34-35`: the "two Saturdays" answer.
  - While you're there, fix the stale "CFS open until 31 October" answer (:53-54). Line :10-11
    already says "a full day".
  - Grep for anything else: `deux|two|both days|les deux|28 nov|November 28|21–28|2 jours`.
- Schedule: `ScheduleBoard` builds day tabs from distinct `day` values. With one day, **no tab
  bar** should render. Check the home `ScheduleOverviewPreview` too.
- Update ADR 0038 by writing a new ADR that supersedes its dates section.

### A2. Sales close

- **Enforce it on the server.** After `salesCloseAt`, checkout must refuse ticket purchases. Do
  this in the pricing/checkout path (`src/lib/payments/pricing.ts:207+`, `catalog.ts:35`,
  `isPurchasable`) with a clear bilingual error. Don't rely on the UI alone.
  - **Decided:** only tickets and **ticket-only** products (commit 2c223a3) close.
    **The general shop stays open.**
  - From now on, the shop (listing, product page, cart and checkout) shows a clear bilingual
    notice: "You can still order, but items ordered now may not be ready by event day
    (Sat 21 Nov). We'll get them to you as soon as they're in."
    - Show it on the checkout step too, and add it to the shop's recorded consent wording
      (`pages.shop.returnsAck`, saved into `payment_intents.terms_text`), so the buyer
      accepted it explicitly.
    - Changing it only affects new orders; note that in the ADR.
- **Tickets page:** before the cutoff, show a prominent "Sales close Wed 18 Nov, 23:59" notice.
  Show a live countdown in the final 48 h. After the cutoff, paid tier cards switch to a
  "Sales closed" state; reuse the sold-out styling.
  - The free Haikyu card still links to Bevy unless the organiser says otherwise.
- **Banner:** add a derived announcement, "Ticket sales close Wednesday 18 Nov at 23:59".
  - It slots into `AnnouncementBanner` priority **after** the dashboard text and **before**
    the CFS / fallback message.
  - Hide it automatically after the cutoff.
  - Fix the dismissal bug: `GlobalChrome.tsx:11,36` dismisses under one fixed key, so a new
    message never reappears. Key the dismissal by a hash of the message text.
- Hero and home ticket CTAs: after the cutoff, swap to the closed state, not a dead link.

---

## Part B — Publish the speakers  (branch `feat/speakers-lineup-2026`)

### Source data

The organiser puts the **full** Sessionize export (xlsx or csv, "accepted sessions,
flattened", exported 2026-11-15) at `devfest-yaounde-web/.private/sessionize-accepted.xlsx`.

- `/.private/` is already in `.gitignore` (added 2026-11-15); confirm with `git check-ignore`. **Never commit the export.**
- If the file is missing, stop and ask for it. The PDF the organiser has is truncated and is
  not a usable source.

**Privacy: publish only public fields.** Never put phone numbers, owner emails, residence,
T-shirt size, or the "owner informed/confirmed" timestamps into the repo, the DB, a commit
message or a log.

| Export column | Site field |
|---|---|
| FirstName + LastName | `name`. Fix the order and casing where Sessionize split it badly (see the table below). |
| TagLine | `role` {fr,en}. Translate; keep the original language as one side. `company` is taken from the tagline when it names one. |
| Bio | `bio` {fr,en}. Translate into the missing language and keep the speaker's own text verbatim on their side. Fix obvious typos only. |
| Profile Picture | `photoUrl`. See Photos below. |
| LinkedIn / Blog / Company Website / X | `social.linkedin` / `social.website` (Blog, or Company if there's no blog) / `social.x`. Drop Facebook unless the schema already supports it. |
| Ice breaker question / answer | `icebreakerQuestion` / `icebreakerAnswer` {fr,en} where given, otherwise the schema's existing empty-state value. Check how `"—"` renders and make sure it renders nothing. |
| Session Id + Title + Description | One `Session` per row (`speakerIds: [speaker]`, and the speaker's `sessionIds: [session]`). |
| Session format | `kind`: Workshop → `workshop`, Lightning talk → `talk`. Keep "lightning" visible, e.g. as a tag or the duration. |
| Session type (In person / Online) | Hubert Nang's session is **Online**. Show an "Online" marker. |
| Level, Language, Tags | Add optional `level` and `language` fields to the Session type and Zod schema (`src/data/types.ts:172-194`, `schemas.ts:91-109`), and render them as chips. Tags map to `tags[]`. |
| Room / Scheduled At | **Empty in the export.** Nothing is scheduled yet. |

Expected roster, as a cross-check (24 people, 24 sessions; 4 workshops):

| Sessionize id | Display name | Format | Notes |
|---|---|---|---|
| 1339016 | Cabrel Domfang | Workshop | |
| 1350359 | Egbe Michel ("Mich") | Workshop | "From git push…" |
| 1350410 | Linda Ebete | Lightning | |
| 1351469 | Danwe Basga | Lightning | |
| 1352359 | Rostand Tchuekam | Lightning | |
| 1352668 | Steve Kambea Ndjeumou | Lightning | export splits it as "Kambea ndjeumou / Steve" |
| 1353400 | Samuel De Essaka | Lightning | |
| 1353994 | Emerson Folong | Lightning | |
| 1354849 | Manuel Karim Abolo | Lightning | export has "ABOLO" in caps |
| 1355263 | Gervais Azanga Ayissi | Lightning | |
| 1367658 | Destin Kouam | Lightning | |
| 1368723 | Arnaud Dzudie | Lightning | |
| 1369967 | Anita Dongmo | Lightning | |
| 1371401 | Sandra Macheu Talla | Lightning | |
| 1371405 | Verdiane Fotso | Lightning | |
| 1371413 | Ange Naomy Kengne Takoumbo | Lightning | export splits it as "Kengne Takoumbo / Ange Naomy" |
| 1372363 | Nathan Foka | Lightning | |
| 1372444 | Hubert Nang | Lightning | **Online** |
| 1372498 | Le Prince Dachi | Lightning | export splits it as "Le / Prince Dachi" |
| 1373948 | Marie Ipouk | Workshop | |
| 1376249 | David Njome | Lightning | export: "Njome / David" |
| 1376670 | Noémie Youbissi | Workshop | |
| 1376783 | Raïssa Wokmeni | Lightning | |
| 1377020 | Freddy Choudja | Lightning | |

Name-order fixes are a best guess. **List every renamed person in the review summary**
so the organiser can confirm.

### Photos

- `cdn.sessionize.com` is not in `next.config.ts` `remotePatterns`. It would render, but
  unoptimised, through the `ContentImage` `<img>` fallback, and it would depend on Sessionize staying up.
- Download each 400×400 image and convert it to WebP with sharp.
  - Commit them as `public/speakers/<slug>.webp`, and set `photoUrl: "/speakers/<slug>.webp"`.
    `src/lib/images.ts:22` already accepts local paths.
  - This needs no DB write and gets `next/image` optimisation.
- Pair photos to people by **row in the full export**, never by list position in the PDF.
- Look at every image once (fr page screenshot) to catch a mismatched face or a logo instead of a photo.

### Sessions without times

The `Session` schema requires `time`, and the schedule must not show invented times.

- Make `time` optional, or add an explicit `unscheduled` state, so sessions can exist
  without a slot.
- `ScheduleBoard` should show unscheduled sessions as a "Programme — time slots coming soon"
  list grouped by format (workshops, then lightning talks), not on a timeline.
- Every speaker profile shows their talk: title, format, level, language, tags, an "Online"
  marker if relevant, and the description.

### Publishing

- Write `src/data/speakers.json` + `src/data/sessions.json`.
- Then read-only check `editorial_documents` for `speakers` / `sessions` rows.
  - If they exist, ship a migration upserting both arrays, with a deploy note.
  - Otherwise the JSON goes live with the deploy.
- `cfsView` (`src/lib/content/cfs.ts:33-58`) flips `/speakers` to the lineup once a visible
  speaker exists. Confirm that the `cfs` override setting doesn't pin it to the call view.
- **Home: a daily speaker spotlight** (decided). There's no agenda yet, so the home
  `SpeakerShowcase` shows a **random selection of speakers that changes each day**.
  - Today it shows only `featured` speakers and renders nothing otherwise. Change that.
  - Pick N speakers (fit the existing layout, e.g. 4–6) with a **deterministic shuffle seeded by
    the current date in Africa/Douala** (e.g. `YYYY-MM-DD`). Everyone sees the same spotlight
    that day, server and client agree (no hydration mismatch), and it rotates at local midnight.
  - The page must pick up the new day. Use a daily revalidation (`revalidate` up to 3600 s is fine)
    or compute the seed where the page is already dynamic. Don't make the whole home page fully dynamic for this.
  - Rotate fairly over the week so every speaker gets a turn: e.g. take a seeded permutation of
    all speakers and show the window `[dayIndex·N … +N)`, wrapping around.
  - `featured: true` still wins. Featured speakers are pinned first, and the random picks fill the rest.
  - Add a small label like "Today's spotlight" / "À l'affiche aujourd'hui" and a "See all speakers" link.
  - Unit-test the picker: same date gives the same picks, different dates differ, no duplicates,
    and fewer speakers than N works.
- Fix the revalidation gap in `src/lib/content/revalidate.ts:38-40`:
  - Speaker saves must refresh `/speakers`, `/` and `/schedule`.
  - Session saves must refresh `/schedule`, `/` and `/speakers`.
  - Do this for both locales.
- Update `docs/guides/updating-content.md` (the speakers section at ~:33 and sessions at ~:89):
  how to add times later, and how to re-import.

---

## Part D — Terms, FAQs, and the "terms updated" pop-up  (branch `feat/participation-terms`)

(D comes before C on purpose: the terms must be live before Wednesday.)

### The rule to state clearly, without hostility

> DevFest Yaoundé is a free community event: the talks, workshops, sponsor stands and the
> community are open to everyone with a free (Haikyu) or paid pass. **Food and drinks, swag
> (T-shirts, goodies, stickers…), event identifiers (badge, lanyard, bracelet or similar) and
> every other physical perk are reserved for paid ticket holders (Sonnet, Opus, Fable,
> Mythos)**, and only for what their tier lists. A free pass gives no claim to them, including
> if supplies remain at the end of the day.

Write it in fr and en using `devfest-brand-voice` ("friends who build things": warm and clear,
never legalese and never scolding). The French version is the reference.

### What to build

1. **An on-site Participation terms page**, `/[locale]/terms`.
   - Today the footer's legal links all point to external Google/GDG documents
     (`site_settings.legal`, `site-config.ts:77-80`). Use `src/app/[locale]/wall/terms/page.tsx`
     as the structural template.
   - Sections:
     - What DevFest is (free, community-run by GDG Yaoundé).
     - Free vs paid passes: a clear table of what each tier includes, generated from
       `ticket-tiers` data so it can't drift.
     - Food & swag: the rule above.
     - Entry & badges (decided):
       - A free pass gets you **in**: talks, workshops (within room capacity) and the sponsor stands.
       - It does **not** guarantee a physical identifier: no badge, lanyard, bracelet or similar.
         Organisers may hand some out on the day, but free-pass holders shouldn't expect one.
       - Paid passes get theirs as part of the tier.
       - Don't name a specific item (badge vs lanyard vs bracelet). The format isn't fixed, so
         say "badge, lanyard, bracelet or similar".
     - Ticket changes until 18 Nov 23:59.
     - Refunds: link the existing refund policy (`docs/content/refund-policy.md`; line 14 covers the free tier).
     - Photos & the DP wall: link `/wall/terms`.
     - The Google/GDG Code of Conduct (still external, per ADR 0040).
     - Contact.
   - Show a visible **version + "Last updated 15 Nov 2026"** at the top.
   - Point `legal.participationTermsUrl`'s default at the new page. Leave privacy and ToS external.
2. **Version the terms.** Add `legal.termsVersion` (e.g. `"2026-11-15"`) and
   `legal.termsUpdatedAt` to the settings schema, with repo defaults and a migration if
   `legal` needs no new column (it's jsonb, so merging defaults is enough). Bumping the version
   is what triggers the pop-up and goes in the admin config.
3. **Remove the contradictions.** `src/data/ticket-tiers.json:3-43` gives Haikyu
   "Lunch and coffee breaks" and "This edition's badge", and commit 2c223a3 made the free
   tier's swag show on its card (`SwagPreview`).
   - Remove the food perk **and** "This edition's badge" from Haikyu.
   - Add the identifier ("badge, lanyard, bracelet or similar") to every paid tier's perks.
   - Remove any `swagProductIds` / swag preview from free tiers.
   - Make the paid tiers' perks list food explicitly where they include it.
   - Check the live `ticket-tiers` DB row read-only. If it overrides the JSON, ship the
     migration or the exact admin steps.
   - Also check checkout consent: `src/lib/payments/terms.ts` and `pages.tickets.refundAck` are
     what gets recorded in `payment_intents.terms_text`. Add one line referencing the
     participation terms. Changing it only affects new orders, which is intended; note this in the ADR.
4. **FAQs** (`src/data/faqs.json` + the DB override if published):
   - Rewrite `faq-ticket-types` (:85-102), `faq-free-ticket` (:104-121), `faq-food-venue`
     (:227-244), `faq-shop-without-ticket` (:246) and `faq-ticket-bought-for-friend` (:191) to
     match the rule.
   - Add three new FAQs:
     - "Is DevFest free?" (yes, and here is what free covers)
     - "Will there be food for free-pass holders?" (no; bring your own / nearby options if the venue allows)
     - "Can I change my T-shirt size?" (yes, from your account, until Wed 18 Nov 23:59)
   - Every FAQ that touches perks links to `/terms`.
5. **The "terms updated" pop-up.**
   - On the next visit, show it once per browser per `termsVersion`, using `ui/Modal.tsx`
     (dialog variant). Content: a 2–3 line summary of what changed, a "Read the terms" link and a "Got it" button.
   - Add a `useSeenOnce(key)` hook backed by **localStorage**. Copy the `useSyncExternalStore`
     shape of `src/lib/use-session-dismissed.ts` and the storage guarding in
     `src/lib/use-cart.ts:47-67`.
     - The key is `devfest:terms-seen:<termsVersion>`.
     - Wrap access in try/catch. If storage is unavailable, show it once per session, never on every page.
   - Don't show it on `/admin`, `/terms` itself, or during the preloader handoff. Wait until the
     preloader finishes (ADR 0041). Make sure the modal never steals focus during the hero entrance.
   - Mount it in `src/app/[locale]/layout.tsx` next to `GlobalChrome`.
   - Accessibility: focus trap, Esc closes, `aria-labelledby`, and it respects reduced motion.
6. Docs: an ADR for "participation terms on-site + versioned pop-up", plus updates to
   `docs/guides/updating-global-chrome.md` (how to bump the terms version).

---

## Part C — Let ticket holders edit their ticket until Wednesday  (branch `feat/ticket-self-edit`)

- **Who:** the signed-in user whose `auth.uid() = tickets.user_id`. That's the buyer for unclaimed
  tickets they bought for others, and the attendee once claimed (`0024_ticket_claim.sql`).
- **What is editable:**
  - `apparel_size` (XS–XXL, `src/lib/payments/schemas.ts:11`), only if the tier
    `includesApparel`.
  - `attendee_name`, since it's printed on the badge.
  - **Not** editable: email, tier, `badge_code`, anything money-related. Phone isn't on
    `tickets` (it's in `payment_intents.contact`), so leave it out.
- **Until:** `ticketEditsOpen()` (the shared cutoff, 18 Nov 23:59 Douala). Enforce it on the
  server. After the cutoff, the UI becomes read-only with "Edits closed on 18 Nov — contact us
  if something is wrong".
  - Also refuse edits on checked-in tickets and on tickets with an open or approved refund request (`refund_requests`, 0025).
- **How:** a route handler `PATCH /api/account/tickets/[id]`.
  - Steps: `currentUser()` → load the ticket with the session client (RLS proves ownership) →
    Zod-validate the body (strict, only the allowed keys) → update with
    `createAdminSupabase()`.
  - The project deliberately has **no client UPDATE policy on money tables**. Don't add one.
  - Rate-limit it the way other account routes do.
  - Write an audit entry if the admin audit log can take non-admin actors; otherwise add `updated_at`.
- **UI:**
  - In `src/components/account/AccountDashboard.tsx` (~:236, where size is shown today), add an
    "Edit" action per ticket. It opens a small form in `Modal` (drawer on mobile).
  - Show a persistent hint: "You can change this until Wed 18 Nov, 23:59".
  - Confirm with `ui/Toast`.
- **Awareness**, so people know they can do this:
  - The Part A sales-close banner and tickets-page notice mention it.
  - The FAQ from Part D.
  - The Part E email.
  - Ticket receipt emails (`renderTicketReceipt`, `src/lib/email/templates.ts:365`) get one line
    plus an account link, for future orders.
- **Admin:**
  - `AdminTickets.tsx` shows the latest size; make sure the tickets CSV export reflects edits.
    The apparel totals per size are what the organisers order shirts from.
  - Add a size-totals summary if none exists.
- Tests:
  - Ownership: another user gets 404, not 403.
  - Cutoff boundary.
  - The apparel field is rejected for non-apparel tiers.
  - Unknown keys are rejected.

---

## Part E — "What's changing" email templates, sent manually  (branch `feat/terms-update-email`)

**Decided: there's no email domain yet, so the site sends nothing.** Organisers download the
templates and send them by hand: Gmail (BCC) for paid holders and site users, and the
**Bevy platform for free-pass holders** (whose RSVPs live only on Bevy). Build no
send button, no Resend batch sender and no broadcast tables.

1. **Two templates**, each a self-contained bilingual email (French first, then English):
   - **`paid`**, for ticket buyers and holders:
     - DevFest is now **one day, Sat 21 Nov**.
     - Ticket sales close **Wed 18 Nov 23:59**.
     - What your pass includes, with food and swag for paid passes per your tier.
     - **Update your T-shirt size and badge name until Wed 23:59** (link to `/account`).
     - The **collector DP frames** are unlocked for you (link to `/dp-generator`).
     - The speakers are announced (link to `/speakers`), plus `/terms`.
   - **`free`**, for Bevy free-pass RSVPs:
     - The event is one day, Sat 21 Nov.
     - Entry, talks and workshops are free.
     - **Food, drinks, swag and event identifiers (badge, lanyard, bracelet or similar) are
       reserved for paid passes.** Say it warmly and clearly
       (`devfest-brand-voice`).
     - Upgrading is possible until Wed 18 Nov 23:59 (link to `/tickets`).
     - Speakers, `/terms`, and what to bring.
   - Subject lines, fr/en: "DevFest Yaoundé — ce qui change avant samedi / what's changing before
     Saturday". Include a preheader line.
2. **Email-client-safe HTML.**
   - Write them as renderers in `src/lib/email/templates.ts` (`renderLaunchUpdate({ audience })`),
     reusing `layout()` (:189) and `button()` (:271): tables, inline styles, max-width ~600px,
     web-safe font fallbacks, and **absolute** `https://` URLs for links and images (logo from the
     live site).
   - No external CSS, no JS, and no template variables left in the output, so it can be pasted as is.
   - Include a plain-text version of each.
   - Check them in Gmail's web view by sending a test from a personal account: dark mode,
     mobile width, and images blocked (alt text must carry the message).
3. **Commit the rendered files** so they can be downloaded straight from GitHub:
   `docs/content/emails/launch-update-2026-11.paid.html`, `….free.html`, and the matching `.txt`.
   Generate them with a small script (`npm run emails:render`) from the renderers, so the files and
   the code can't drift.
4. **Admin "Emails" view** (organiser-only, existing admin auth). It's a download page, not a sender.
   - It previews each template (fr/en shown together, as sent).
   - Buttons: **Download .html**, **Copy HTML** (for Gmail's "insert HTML" tricks / Bevy's
     editor) and **Copy plain text**.
   - **Download recipients CSV**, for the `paid` audience only: the de-duplicated, lower-cased
     union of `tickets.attendee_email` and the buyer email from `payment_intents.contact`
     (activated intents only), plus `profiles.email`.
     - Columns: `email, name, source, locale`.
     - The export goes through an organiser-only route handler, is logged in the admin audit log,
       and is never cached (`Cache-Control: no-store`).
     - Show the counts by source on the page.
   - Add a short "How to send" panel:
     - Gmail limits: about 500 recipients/day for personal accounts and 2,000 for Workspace;
       BCC in batches of ≤ 90.
     - Send the `free` one through Bevy's attendee messaging.
     - Don't paste the recipient list in To/CC.
5. `devfest-security`: organiser-only routes; the CSV is personal data, so no public route, no
   static file, and nothing in the repo.
6. Docs: an ADR "manual email sends until a domain exists". It records that Resend needs a verified
   domain, and that `EMAIL_FROM` falls back to `onboarding@resend.dev`, which only delivers to the
   account owner. That fallback also affects **transactional** receipt/claim emails today: check
   whether production receipts are actually being delivered and report it read-only. Add a runbook
   section in `docs/guides/admin-dashboard.md`.

---

## Part F — Collector-edition DP frames for paid ticket holders  (branch `feat/dp-collector-frames`)

- **Eligibility:** the signed-in user holds at least one ticket where `user_id = auth.uid()`
  **and** (`is_self` **or** `claimed_at is not null`) **and** the tier's `priceXAF > 0`
  (Sonnet, Opus, Fable, Mythos).
  - The `is_self`/`claimed_at` condition stops a buyer who paid for friends from unlocking it
    through their friends' unclaimed tickets. (If they also bought for themselves, they qualify
    through that ticket.)
  - Haikyu is free and RSVP'd on Bevy, so no ticket row exists and it can't unlock.
  - Exclude tickets with an approved refund.
  - Write this as one reusable server helper, `getPaidTicketEntitlement(userId)`, in `src/lib/`.
    Nothing like it exists today; `/api/account/tickets` is the closest pattern.
- **Two new styles**, as `DpFrame` entries designed from the existing pattern vocabulary
  (`src/lib/dp/frames.ts`, `patterns.ts`). Give each a distinct new pattern so they feel
  collectible, not recoloured. Make them bolder than the public 8 and add a small
  "Collector edition · DevFest Yaoundé 2026" plate. Suggested:
  1. **"Gold foil"**: a deep black ground with a flat metallic-yellow (no gradient!) foil
     line-work pattern and an embossed-look plate drawn with flat offset shadows.
  2. **"Ticket stub"**: the photo inside a perforated ticket-stub silhouette, with a serial-style
     strip. It can show the holder's tier name (SONNET … MYTHOS), read from the entitlement.
  - Check both against DESIGN.md: no gradients, yellow-family accents, and they must read at 1080 and 2160.
- **Real gating, not CSS hiding:**
  - Today frames are static client data, so anything in the bundle is unlockable from devtools.
    Keep the collector frame **definitions** out of the public bundle: serve them from
    `GET /api/dp/collector-frames`, which returns the definitions only when the entitlement passes.
  - The canvas pattern *code* may ship, since it's harmless without a definition. Keep it small.
  - Wall saves: `gallery-server.ts` (`cleanTheme` :155) must reject a collector `theme` unless
    the saver is entitled.
- **UI** (`DpGenerator.tsx`, frame picker ~:675):
  - Entitled users see the two frames first with a "Collector" badge.
  - Signed-out or free users see two locked teaser tiles: a silhouette plus "For paid pass holders",
    linking to `/tickets` while sales are open and to the FAQ after.
  - The page stays usable with no sign-in (ADR 0015/0034). Fetch the entitlement lazily and never
    block the generator on it.
- Use `devfest-animation` for a small unlock moment the first time an entitled user opens the
  picker, using the `useSeenOnce` hook from Part D.
- Update `docs/guides/dp-generator.md` ("Changing the styles") and add an ADR "collector frames &
  ticket entitlement".

---

## Review summary format (end of every part)

Include:
- What changed, by file.
- Migrations to apply and in what order relative to the deploy.
- DB rows that override repo JSON, and what you did about each.
- Anything you guessed (name order, translations, featured speakers) for the organiser to confirm.
- Screenshots (fr/en, mobile/desktop).
- Test, lint and type-check results.
- The push status for `origin` and `upstream`.

## Open questions to raise, not decide

None right now. Raise anything new you hit, rather than guessing.

## Already decided (2026-11-15) — don't re-ask

- Event: one day, Sat 21 Nov 2026. Cutoff for ticket sales and ticket edits: Wed 18 Nov 23:59 Douala.
- Collector DP frames: **Sonnet and above** (Sonnet, Opus, Fable, Mythos).
- Free passes are not guaranteed a physical identifier (badge, lanyard, bracelet or similar).
  It's a paid perk, like food and swag.
- General shop stays open after the cutoff, with a "may not be ready by event day" notice.
  Only tickets and ticket-only products close.
- Home speakers: a daily random spotlight (Part B).
- No email domain, so templates only, sent manually (Gmail BCC for paid holders, Bevy for free
  passes). No send button.
- The Sessionize export is at `.private/sessionize-accepted.xlsx` (gitignored).
