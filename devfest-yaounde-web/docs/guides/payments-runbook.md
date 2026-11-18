# Payments runbook

How the money path works, how to switch it on, and what to do when something
looks wrong. Written for whoever is on duty during ticket sales — not
necessarily the person who wrote the code.

Background: `docs/decisions/0013-payments-pawapay.md` (why PawaPay) and
`docs/decisions/0014-persistence-and-auth-supabase.md` (why Supabase).

---

## How a payment settles

**We ask PawaPay. We are never told.**

There is no callback in this flow — the one callback URL on this PawaPay
account belongs to the SCD shop, and a second account would need another
registered company. So settlement works by asking, in two places:

| Path                                                                           | Speed       | Covers                                    |
| ------------------------------------------------------------------------------ | ----------- | ----------------------------------------- |
| The return page polls `/api/payments/status`                                   | seconds     | anyone watching the screen after paying   |
| A sweep inside `/api/cron/cleanup`, every 5 min (Supabase `pg_cron`, ADR 0028) | ≤ 5 minutes | closed tab, dead battery, dropped network |

Both call the same authoritative lookup and the same guarded delivery, so any
number of them racing still issues exactly one ticket.

**Two rules underneath that never change:**

**Nothing is delivered because a message said so.** Whatever arrives —
a poll, the sweep, or a callback if one ever reaches us — we ask PawaPay's API
about that deposit and only that answer counts.

**We write down what we expect before anyone pays.** That record is the
**intent**. If the amount that actually arrives doesn't match it, nothing is
delivered and a human gets involved.

> The `CRON_SECRET` variable is therefore load-bearing. Without it the sweep
> refuses every call, and anyone who closes the tab after paying never gets a
> ticket. See `docs/decisions/0019`.

---

## Going live: the order to do it in

### 1. Supabase

1. Create the project. Note the URL, the anon key and the service role key.
2. Run `supabase/migrations/0001_commerce.sql` (SQL editor, or the Supabase CLI).
3. Enable **Google** under Authentication → Providers. It is the only
   sign-in method (`docs/decisions/0014`).
4. Add the redirect URL: `https://YOUR-DOMAIN/auth/callback`.

### 2. Environment variables

Copy `.env.example`. Every variable is documented there. Four that matter most:

- `SUPABASE_SERVICE_ROLE_KEY` — bypasses all access control. Server-side only,
  never prefixed `NEXT_PUBLIC_`.
- `BADGE_CODE_SECRET` — generate once with `openssl rand -base64 48` and
  **never change it**. Every badge code is derived from it, so rotating it
  invalidates every ticket already issued.
- `CLAIM_TOKEN_SECRET` — same rule, same command, but its OWN value — never
  reuse `BADGE_CODE_SECRET` here. Rotating it invalidates every unclaimed
  "claim your ticket" link already sent (ADR 0062); a ticket already claimed
  is unaffected, since `claimed_at` is what actually gates re-claiming, not
  the token's own validity.
- `APP_BASE_URL` — the real public HTTPS origin. PawaPay sends people back
  here after paying, so `localhost` in production means nobody comes back.

### 3. PawaPay

1. Set `PAWAPAY_ENV=production` and paste the **production** token. A sandbox
   token against the production URL fails as `AUTHENTICATION_ERROR` with no
   useful detail — if you see that error, check this pair first.
2. Nothing to register. Settlement does not need a callback.
   **Optionally**, put `https://YOUR-DOMAIN/api/payments/pawapay/callback` in
   the dashboard's **Checkouts** field — if it reaches us, settlement becomes
   instant instead of within five minutes. Nothing breaks if it does not.
3. Leave all `PAWAPAY_ENFORCE_*` variables empty for now. See below.

### 4. Confirm the sweep is running

The sweep is a settlement path, not housekeeping. Hobby cannot run Vercel
Cron every five minutes, so **Supabase `pg_cron` knocks on the same door**
(ADR 0028). After deploy:

1. Store the two Vault secrets (once, SQL editor):

```sql
select vault.create_secret('https://YOUR-DOMAIN', 'app-base-url');
select vault.create_secret('<same value as CRON_SECRET on Vercel>', 'cron-secret');
```

2. Confirm the job exists and has actually called the app:

```sql
select jobname, schedule, active from cron.job
 where jobname = 'devfest-cleanup-sweep';

select status_code, error_msg, created
  from net._http_response
 order by created desc
 limit 5;
```

A `200` in that table means the sweep ran. `403` is a mismatched
`cron-secret`. `null` / a warning in the Postgres logs means a Vault secret
is missing.

3. You can still call it by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/cleanup
```

A `403` means `CRON_SECRET` is missing or wrong. A JSON body with a
`reconciled` block means the route itself is working.

Vercel Cron still fires **once a day** (`0 4 * * *`) as a backstop. Do not
put `*/5` back in `vercel.json` — Hobby will refuse the deploy.

### 5. Turn on callback verification — only if you registered one

Skip this entirely if you did not register a callback URL.

The callback has three extra fences: an IP allow-list, a body-integrity check,
and a cryptographic signature check. They all **run and log from day one but
reject nothing** until you switch them on. That is deliberate: switching them
on blind could silently reject real payments.

1. Deploy with `PAWAPAY_CALLBACK_IPS` and `PAWAPAY_CALLBACK_PUBLIC_KEY` filled
   in from the PawaPay dashboard, and the `ENFORCE` flags empty.
2. Take a few real payments. In the logs, look for
   `[pawapay/callback] verification findings`.
3. **No findings at all** means every check passed. Now set
   `PAWAPAY_ENFORCE_IP=true` and `PAWAPAY_ENFORCE_SIGNATURE=true`.
4. Findings that say `(monitor only)` are telling you a check would have
   rejected a real payment. Fix the configuration before enforcing.

---

## Reading the money

Everything is in Supabase. Two tables answer most questions.

**`payment_intents`** — one row per checkout attempt.

| `status`          | What it means                                                             |
| ----------------- | ------------------------------------------------------------------------- |
| `pending`         | Started, not paid yet — or paid seconds ago and the callback is in flight |
| `activated`       | Paid, verified, delivered. The happy ending.                              |
| `failed`          | PawaPay reported a terminal failure. Nothing was charged.                 |
| `amount_mismatch` | **Needs a human.** Money arrived, but not the amount we asked for.        |

**`payment_events`** — the audit trail, newest first, keyed by `deposit_id`.
Ids and states only, never card data or attendee personal details.

Useful query — anything that needs attention:

```sql
select deposit_id, kind, charged_amount, currency, status, created_at
  from payment_intents
 where status = 'amount_mismatch'
    or (status = 'pending' and created_at < now() - interval '2 hours')
 order by created_at desc;
```

---

## When something looks wrong

**"They paid but got nothing."**
Find the intent by `deposit_id`. If it is `pending`, the callback either has
not arrived or is being retried — check `payment_events` for
`callback_unexpected_error`. PawaPay retries on its own; a `503` from us is us
_asking_ for a retry, not a failure. If it is `amount_mismatch`, see below.

**`amount_mismatch`.**
The amount or currency that arrived does not match the intent. This is
deliberately never retried and never auto-delivered. Compare the intent's
`charged_amount` against the deposit in the PawaPay dashboard, then either
refund or deliver by hand after reconciling.

**Duplicate tickets.**
Should not be possible: delivery happens inside one SQL function guarded on
`status = 'pending'`, so a replayed callback becomes a no-op. If you ever see
duplicates, that guard is the first thing to check — and it is a bug worth a
decision record.

**Free tickets.**
The Haikyu tier never touches PawaPay: a 0 XAF basket is fulfilled directly at
checkout. Its intent goes `pending → activated` with no deposit behind it, and
that is correct.

**Callbacks are not arriving in local development.**
They cannot — PawaPay needs a public HTTPS URL. Use a tunnel (`ngrok` or
similar) and register that URL, or rely on the status endpoint, which re-checks
the API and settles the payment a little later.

**Supabase project paused.**
The free tier pauses after about a week of inactivity, which is very possible
for an event site between editions. Resume it from the dashboard _before_ sales
open, and check it during a quiet stretch mid-campaign.

---

## Capacity and discount codes

A tier with `quantityAvailable` set is capped **across all orders**, not just
within one. Capacity is reserved the moment a checkout starts, and held for 30
minutes; an abandoned checkout releases its seats when that window passes, and
`/api/cron/cleanup` fails the intent outright an hour in. See
`docs/decisions/0016-capacity-reservations.md`.

The practical consequence: **if the cleanup cron stops running, a tier will
slowly look more sold out than it is.** The 30-minute window bounds the damage,
but check that the cron is firing before a big sales push.

To see what is actually holding seats right now:

```sql
select a ->> 'tierId' as tier, count(*) as held
  from payment_intents pi, jsonb_array_elements(pi.attendees) a
 where pi.status = 'pending'
   and pi.created_at > now() - interval '30 minutes'
 group by 1;
```

Single-use discount codes behave the same way — a code is reserved at checkout
and only committed to `redeemed_count` when the payment completes.

## Receipts

Sent once, when a deposit is first fulfilled — never on a replayed callback.
With `RESEND_API_KEY` unset nothing is sent, the payment still completes, and
`payment_events` records `receipt_skipped`. Look for `receipt_sent`,
`receipt_skipped` or `receipt_failed` per deposit.

A failed send never fails a payment. If receipts stop arriving, the tickets are
still valid — the badge codes are in the database and on `/account`.

**Claim emails** (ADR 0062) go out alongside the receipt, one per ticket where
`is_self = false` — sent to `attendee_email`, not the buyer. Look for
`claim_email_sent`/`claim_email_skipped`/`claim_email_failed` per deposit, and
`claim_claimed`/`claim_already_claimed`/`claim_not_claimable`/`claim_expired`/
`claim_invalid_token` (deposit id null on these — they come from
`POST /api/tickets/claim`, after the link's already been opened) once someone
actually opens the link. Requires `CLAIM_TOKEN_SECRET` to be set — see
Environment variables below — or checkout itself refuses to start a ticket
order, the same way a missing `BADGE_CODE_SECRET` already does.

## Background: the callback question

None of this is needed to run the event. It is kept because the
constraint behind it is real and will come back if a second application
ever needs this PawaPay account, or if instant settlement starts to
matter more than five minutes.

## Running behind a relay (not the current setup)

PawaPay calls this app **directly**:

```
PawaPay  →  https://<this-app>/api/payments/pawapay/callback
```

Nothing below applies unless a relay is introduced later. Keeping it because
the constraint that would force one is real: PawaPay's callback URL is
configured per environment in their dashboard, not per request —
`POST /v2/paymentpage` has no `callbackUrl` field. One PawaPay environment
therefore has exactly one callback address, so the day a second application
needs the same environment, something has to sit in front and fan out.

Direct is the better arrangement while it lasts: both the IP allow-list and
the HTTP signature check work natively, with no overrides and no third party
on the money path.

### What a relay would have to do

- **Forward the body byte for byte.** `Content-Digest` is computed over the
  exact bytes PawaPay sent. Parsing the JSON and re-serialising it changes
  whitespace and key order, and the digest check then fails.
- **Forward these headers unchanged:** `Content-Digest`, `Signature`,
  `Signature-Input`.
- **Pass the response through.** Our status code is a control signal to
  PawaPay: `200` means "settled, stop resending", `5xx` means "please resend".
  A relay that always answers `200` silently turns every retryable failure
  into a lost payment.
- **Not retry on its own.** We are already idempotent, so a relay-level retry
  is harmless — but it hides the real state from PawaPay.

### What a relay would cost

| Check                  | Behind a relay                                   |
| ---------------------- | ------------------------------------------------ |
| Authoritative re-fetch | **Unaffected.** Still the real guard             |
| `Content-Digest`       | Works, if the body is forwarded untouched        |
| HTTP signature         | Works **only** with the two variables below      |
| IP allow-list          | PawaPay's IPs are invisible; you see the relay's |

PawaPay signs the address it was given — the gateway's authority and path —
so rebuilding the signature base from the address _we_ see could never match.
Tell the app what was actually signed:

```
PAWAPAY_SIGNATURE_AUTHORITY="<gateway-host>.execute-api.us-east-1.amazonaws.com"
PAWAPAY_SIGNATURE_PATH="/prod/api/webhooks/pawapay/deposits"
```

With those set, signature verification works normally through the relay.
Without them it fails every time, which is why they must be set _before_
`PAWAPAY_ENFORCE_SIGNATURE` is ever turned on.

For the IP allow-list, `PAWAPAY_CALLBACK_IPS` must list the **relay's** egress
addresses, not PawaPay's. If the gateway has no fixed NAT address, leave the
IP check off — it cannot be made meaningful, and the re-fetch already covers
what matters.

### One more consequence

Ticketing would depend on the relay being up. If the gateway were down,
PawaPay's callbacks would fail and be retried — nothing lost, but tickets
issued late. The status endpoint keeps working throughout either way, because
it asks PawaPay directly rather than waiting to be told.

---

## Sharing one PawaPay account with another application

The dashboard has **one callback URL per operation type** — Deposits, Refunds,
Checkouts — not one per application. Two apps on the same account therefore
compete for the same field, unless they use different operation types.

Which field a Payment Page fires is **not settled by the documentation**: the
Payment Page guide says "you will receive a deposit callback", while the
dashboard exposes a separate `Checkouts` field. Resolve it by experiment, not
by reading — see below.

### Finding out which field fires

1. Put this app's callback in **Checkouts**, leave **Deposits** as it is.
2. Make one real minimum-amount payment through the ticket flow.
3. Look at `payment_events` for that `deposit_id`:

```sql
select event, detail, created_at
  from payment_events
 where deposit_id = '<the deposit id>'
 order by created_at;
```

Rows means the callback reached us — `Checkouts` is the right field. No rows
means it went to `Deposits`, and the two apps genuinely collide.

### It does not matter much any more

Since ADR 0019 this app **does not need a callback**. Payments settle by
asking PawaPay:

- the return page poll settles while the buyer watches it — seconds;
- the five-minute sweep in `/api/cron/cleanup` catches everyone else.

Both funnel into the same guarded transaction as the callback did, so any
number of them racing still delivers exactly once.

If the `Checkouts` field does reach us, keep it: settlement becomes instant
instead of within five minutes. If it does not, nothing is lost.

A second PawaPay account was ruled out — it requires registering another
legal entity, not filling in a form.

### What this app does with a deposit that is not its own

Nothing harmful. The callback looks the deposit up, finds no intent, and asks
PawaPay to retry — the same behaviour that protects against a callback
arriving before our own insert. After a few such retries it concludes the
deposit belongs elsewhere, logs `foreign_deposit_ignored`, and returns 200 so
PawaPay stops.

Worth knowing about the other direction: an endpoint that returns 200 for an
unrecognised deposit tells PawaPay "delivered" and it will never retry. If the
other application does that, a payment meant for this one is lost silently.

---

## What is not built

- **Card payments.** `PAGES.md` §7 wants card as a secondary option; this
  integration is Mobile Money only. Tracked in `0013`.
- **Refunds.** Cancelling an order moves no money. Refunding is manual, in the
  PawaPay dashboard. _Commerce → Refunds & exchanges_ in the admin dashboard
  (ADR 0064) tracks that a request was made and its status — it does not
  perform the refund or exchange itself.
- **Any interface** for check-in or order management — the endpoints exist, the
  screens do not. See `docs/guides/check-in-and-orders.md`.
- **Discount code admin.** Codes are rows in `discount_codes`, managed by hand
  in the Supabase dashboard. Who issues them is still open.
- **Per-edition capacity.** Ticket counts span every edition, so reusing a tier
  id next year would count this year's sales against it.
