# 0062 — Self-service ticket claim by email + Google sign-in; closing out the email provider

Date: 2026-09-16
Status: Accepted (PHASE22 §C) — extends ADR 0003's still-open item on email, builds on ADR 0014's Google-only auth

## 1. What already existed, checked before writing anything

PHASE22 §C asked to "finish email provider wiring + verify real send" and add "ticket ownership/transfer via claim email + Google sign-in." Before building anything, an audit of the actual code (not assumption) found:

- **Email dispatch already works.** `src/lib/email/send.ts` posts to Resend's API; `sendReceipt()` (`src/lib/payments/notify.ts`) is wired to fire exactly once, from both fulfilment paths, whenever `apply_paid_deposit`/`fulfilFreeIntent` report `"applied"`. `RESEND_API_KEY` unset means "skipped, logged" rather than a thrown error — a payment must never fail because mail didn't send. `docs/backend/GAPS.md`'s G3 already called this "a config gap, not a code gap." Nothing here needed building.
- **Ticket transfer did not exist at all.** Every "claim" hit in the codebase referred to something else — `is_self` (which ticket in an order the buyer kept, ADR 0025) or a Postgres row lock (`FOR UPDATE`). No token, no column, no route, no page. `docs/content/refund-policy.md` promises "a paid ticket can be transferred: the buyer tells us the new attendee's name... and we reissue it" — a manual, support-mediated process, and it stays exactly that; see §3.
- **Google sign-in already works** (ADR 0014) — `signInWithGoogle(locale, next)` already supports a post-login redirect, which is what a claim link's flow needed.

So the actual new work is the claim feature. The email side needed one addition (a new template + one more send per non-self ticket) and a closing decision, not new plumbing.

## 2. Self-service claim: what it does and doesn't cover

A ticket bought for someone else (`is_self = false`, PHASE22 §B's own FAQ copy already promised this: _"if you bought a ticket on someone else's behalf, they can claim it into their own account to manage and check in with it themselves"_) now gets a **separate email**, sent to `attendee_email` alongside — not instead of — the buyer's own receipt. It contains a link to `/{locale}/account/claim/{ticketId}/{token}`. Opening it:

1. Prompts Google sign-in if not already signed in (reusing `signInWithGoogle`'s existing `next` redirect, so it lands back on the same claim URL after auth).
2. Once signed in, submits automatically — no second "are you sure," since clicking the emailed link and going through Google's own consent screen already were the two confirmations.
3. `POST /api/tickets/claim` verifies the token, then calls `claim_ticket(p_ticket_id, p_new_user_id)` — a `SECURITY DEFINER` function (`supabase/migrations/0024_ticket_claim.sql`) that claims the row `FOR UPDATE`, the same shape `check_in_ticket` already uses for the identical "two submissions at once" race, and reassigns `tickets.user_id` to the claimant while stamping `claimed_at`.

**What this is not: a way to change who the ticket is for.** The attendee's name and email were already fixed at checkout; claiming only gives that SAME named attendee account access — visibility under their own `/account`, and the ability to check in under their own name instead of the buyer's. Actually renaming a ticket to a different person entirely stays the manual, support-mediated process `refund-policy.md` already describes — deliberately: PHASE22's brief did not ask for that to become self-service, and doing so would mean deciding what happens to the OLD attendee's data, whether the buyer needs to consent, and how a name mismatch at the door is handled — none of which this phase settled. `docs/content/refund-policy.md` now says both exist, and says which is which.

### Why `tickets.user_id` is reassigned outright, not tracked alongside the original

`payment_intents.user_id` and `orders.user_id` — the actual financial record of who paid — are untouched by a claim. Only `tickets.user_id`, which already meant something narrower ("who this ticket currently belongs to for account purposes," not "who paid" — that distinction is `is_self`'s whole reason for existing, ADR 0025) moves. One side effect, and a GOOD one: `/api/account/tickets` joins `payment_intents` through the session client, gated by `own intents readable` RLS (`auth.uid() = user_id`). After a claim, the claimant's session no longer matches that policy against the ORIGINAL payer's intent row — so the claimed ticket shows its tier, name and badge code, but the price the buyer paid quietly disappears from the claimant's view. Nobody had to write that rule; it falls out of RLS already scoping `payment_intents` to the person who actually paid, and it happens to be the right privacy behaviour for a gifted ticket.

### The claim token: a derived HMAC, not a stored secret

`src/lib/security/claim-token.ts` mirrors `badge-code.ts` exactly — `HMAC(secret, ticketId)`, verified with `timingSafeEqual` — but with its **own** `CLAIM_TOKEN_SECRET`, deliberately separate from `BADGE_CODE_SECRET`. The two protect different things (who may scan a badge at the door vs. who may take over an account link to a ticket); sharing a key would mean a rotation made for one reason silently affects the other. Nothing is stored in the database — the token is always recomputed from the ticket id, so there is no capability value for a leaked backup or a curious admin to read. **Reuse, not single-use, is what a still-valid token still buys you after a claim** — `claimed_at` is the actual guard, checked in `claim_ticket()` before the token's own validity is even relevant.

### Expiry ties to the one place the event's dates already live

A derived HMAC token has no expiry of its own — it is valid for as long as the secret exists. Rather than inventing a second expiry timestamp to store and check, `POST /api/tickets/claim` calls the already-existing, already-tested `eventHasEnded()` (`src/lib/event.ts`) and refuses to claim after the event is over. This is a deliberate choice over a fixed window (30/90 days): the whole point of claiming is being able to check in under your own login, which only matters up to and including the event itself — and reusing the one place `EVENT_DATES` lives means this can never drift out of sync with the real date the way a hardcoded "90 days from purchase" constant eventually would.

## 3. Closing the email provider decision

ADR 0003's closing note left one line open: _"provider still not chosen, Resend is wired as the one concrete adapter."_ PHASE22 §C explicitly asks to finish that. **Decision: Resend is the provider**, full stop — not "the only one wired so far." `send.ts`'s two-adapter shape (configured → sent through Resend; unconfigured → logged and skipped) stays exactly as it is; nothing about the code needed to change to make this official; what changed is that the ambiguity is now recorded as resolved rather than open.

**What "finish" did NOT mean here, and could not from this environment:** confirming a real message actually lands in a real inbox against the production Resend account and the verified `gdgyaounde.com` domain. That is an operational check against live credentials this sandbox does not have and, per this project's standing rule, must not attempt — `.env.local` here points at the real production Supabase project and is read-only for exactly this reason; the same caution extends to not making a live call against a real Resend key even if one were available. What COULD be verified, and was:

- `sendEmail()`'s Resend request shape (endpoint, auth header, body) was already correct and unit-testable at the boundary that matters — not re-verified here since nothing about it changed.
- The NEW code path — a claim email actually gets queued alongside the receipt for every non-self ticket — is exercised by `notify.ts`'s changes and by the new `renderTicketClaim` tests.
- The claim email's HTML was screenshotted (a standalone render, not a real inbox) to confirm it doesn't break the shared `layout()`/`button()` shell the two existing templates already use.

## Verified

- `claim-token.ts`: deterministic per ticket, differs across tickets, verifies only against its own ticket id, rejects a tampered token, refuses to run on a short/missing secret — 6 new tests in `tests/payments.test.ts`.
- `renderTicketClaim`: carries the attendee name, badge code and claim URL in both HTML and the plain-text part; escapes a hostile attendee name instead of rendering it as markup; speaks the right locale; still renders a complete message when the tier name/label is absent — 4 new tests.
- The claim page: screenshotted signed-out in both locales, showing the Google sign-in prompt with the claim link preserved as the post-auth redirect.
- `POST /api/tickets/claim` confirmed refusing an unauthenticated request with `401 unauthenticated` before touching the token or the database at all.
- `npm run verify` (198 tests, lint, typecheck) and `npm run build` pass. No new dependency; no gradients introduced.
- **Not verified, and cannot be from here:** an actual claim end-to-end against a live Google sign-in and a live Supabase database — this sandbox does not have real Google OAuth credentials to complete a browser consent flow, and per the standing production-read-only rule, no write was attempted against the real database to fake one. The RPC (`claim_ticket`) was reviewed, not executed against Postgres — there is no local Postgres in this environment to run migrations against, the same limitation ADR 0060's migration noted for `0023`.

## Consequences

- `CLAIM_TOKEN_SECRET` must be set in production before the next ticket sale, the same way `BADGE_CODE_SECRET` already must be — `assertClaimSecretConfigured()` is called at checkout, alongside the badge-secret check, so a misconfigured deployment fails before a payment page exists rather than after someone has paid.
- Migration `0024_ticket_claim.sql` must run before any ticket can be claimed — `tickets.claimed_at` and `claim_ticket()` do not exist until it does. Nothing about existing rows or existing behaviour changes until then; reads and check-in are unaffected either way.
- A claimed ticket disappearing from the ORIGINAL buyer's `/account/tickets` list (because `user_id` moved) is intentional, not a bug to fix later — the buyer's own receipt email is the permanent record of what they bought and for whom.
