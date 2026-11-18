# 0064 — A visibility tracker for manual refund/exchange requests

Date: 2026-09-16
Status: Accepted (PHASE22 §D)

## What was actually still open, checked before building anything

PHASE22 §D's brief was two things: "persist refund/exchange acknowledgment
server-side with a policy-text snapshot/hash" and "a lightweight admin
tracker for manual refund/exchange requests." Before writing code, the
first half turned out to already be done — **ADR 0022** (2026-09-02) added
`payment_intents.terms_accepted_at` (server clock) and `.terms_text` (the
exact wording, re-read server-side per locale, never from the request
body), and both checkout schemas already require `acceptedTerms: true`.
`docs/backend/GAPS.md`'s G9 already says `RESOLVED`.

**What was NOT already done, and what `docs/content/refund-policy.md`
still incorrectly said was missing**, is documented above in that file's
own history now — its "What is NOT enforced server-side" section was
never updated when ADR 0022 shipped, and was still telling anyone who read
it that the acknowledgment was "a client-side gate only." That stale
section is fixed as part of this change, independent of anything else
here — it was simply wrong, discovered while researching what this part
actually still needed.

So the real, new scope of this part is the second half: the tracker.

## What the tracker is, and — just as importantly — is not

**It does not move money.** Tickets stay non-refundable
(`docs/content/refund-policy.md`, unchanged). Shop exchanges stay handled
manually, off-platform. This does not add a self-service request form for
buyers, does not touch a ticket's `checked_in_at` or an order's own
`status`, and does not call PawaPay. It is the thing that was actually
missing: somewhere for an organiser to log a request that arrived by
email and see whether anyone has answered it yet, instead of that
information living only in an inbox.

`refund_requests` (migration `0025`) — one row per request:

| Column                    | What it holds                                                               |
| ------------------------- | --------------------------------------------------------------------------- |
| `kind`                    | `tickets` or `shop`                                                         |
| `reference`               | Free text — a badge code, deposit id, order id, whatever the requester gave |
| `requester_name`/`_email` | Who asked                                                                   |
| `reason`                  | Why                                                                         |
| `status`                  | `requested → in_progress → resolved` or `denied`                            |
| `notes`                   | An organiser's own running note                                             |
| `created_by`              | Which organiser logged it                                                   |

**`reference` is free text on purpose, not a foreign key.** Requiring a
real ticket or order id would refuse to record a request the moment an
organiser hasn't looked one up yet — and the whole point is to capture it
the instant it comes in, not to gate that on a database lookup first.

## The transition table, same reasoning as orders

`src/lib/admin/refund-lifecycle.ts` mirrors `payments/order-lifecycle.ts`
exactly — a request only moves through allowed transitions, checked
server-side on every write:

```
requested   → in_progress, resolved, denied
in_progress → resolved, denied, requested   (put back in the open queue)
resolved    → (terminal — a completed refund/exchange is a real-world
               event, not a status to flip back)
denied      → in_progress                    (reconsidered, not restarted)
```

`resolved` is terminal for the same reason `delivered`/`cancelled` are on a
shop order (ADR from `order-lifecycle.ts`'s own header comment): undoing
one is a real event that deserves its own new record, not a quiet status
flip. `denied` can be reconsidered — new information arrives, an organiser
changes their mind — but moves back into active work rather than a fresh
`requested`, so the history shows it was revisited rather than restarted.

`POST /api/admin/refund-requests/:id` (PATCH) validates the transition
against the row's CURRENT status, read inside the same request, with a
compare-and-set `.eq("status", from)` on the write — the identical shape
`/api/orders/:id/status` already uses to stop two organiser tabs from
trampling each other's change.

## Access, matching `admin_audit`'s own pattern exactly

RLS enabled, ONE select policy (`is_organiser()`), no insert/update/delete
policy — every write goes through an API route on the service role, which
does its own `currentOrganiser()` check and its own `recordAudit()` entry.
This is not a new pattern invented for this table; it is the same shape
`admin_audit` (migration `0011`) already uses, reused rather than
reinvented.

## Delete, double-confirmed — the cross-cutting rule, not a new one

Deleting a mistakenly-logged entry goes through `ConfirmDeleteModal` — the
same typed-id confirmation component every other admin delete already
uses (ADR 0052), reused directly rather than a bespoke "are you sure."
This phase's own cross-cutting rule ("every admin delete double-validated")
is satisfied by reuse, not by building a second confirmation pattern.

## Why this is a dedicated Postgres table, not an editorial-store entry

`EntityCrud` and the `editorial_documents` JSON-blob store (ADR 0031) are
for CONTENT — FAQs, sponsors, testimonials — read and written as a whole
array, versioned by a save. A refund request is operational data with
row-level concurrent writes from possibly-simultaneous organisers (compare-
and-set matters here the same way it matters for an order's status), which
is exactly the shape `orders`/`payment_intents`/`admin_audit` already use.
Following that existing pattern — a real table, a dedicated route, audit
on write — was the natural fit; forcing this into the JSON-blob store would
have meant losing per-row concurrency safety for no benefit.

## Verified

- New tests for `refund-lifecycle.ts`: every transition table case above,
  `resolved` confirmed terminal against all four statuses, `denied`
  confirmed reconsiderable only into `in_progress` (not `requested` or
  `resolved` directly), and `isRefundRequestStatus` rejecting anything
  not in the enum.
- `npm run verify` (210 tests, lint, typecheck) and `npm run build` pass;
  both new routes (`/api/admin/refund-requests`,
  `/api/admin/refund-requests/[id]`) and the new admin view render in the
  build output. No new dependency; no gradients introduced.
- Not verified against a live database in this environment — the standing
  rule against writing to the production Supabase project applies here
  the same as everywhere else in this session; the migration was
  reviewed, not executed.

## Consequences

- `docs/content/refund-policy.md` now correctly states that consent IS
  recorded server-side (it always was, since ADR 0022 — the doc was
  simply wrong until this change). Anyone who read that section between
  2026-09-02 and today and concluded the consent wasn't evidence was
  reading stale information.
- The tracker adds visibility, not process. An organiser still has to
  actually answer the email and actually process the refund/exchange by
  hand; this only stops that work from being invisible to everyone else
  on the team.
