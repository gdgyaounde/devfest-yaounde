# 0069 — Promoting and removing admins from the Users page, with the lockout rules in the database

Date: 2026-09-20
Status: Accepted (PHASE23 §E) — **migration 0026 must be applied before this code is used**

## What, and why it is different from every other admin write

Until now, being an admin meant a row in `organisers`, added by hand in the
Supabase SQL console. The Users page can now promote a signed-in user to admin
and remove an admin. That is a privilege-escalation surface — an admin can
already see money and other people's data, and this lets them hand that over,
recursively — so the rules that must never break are not in the UI and not
only in the route. They are in Postgres, where a hidden button, a direct API
call and a buggy caller all arrive at the same function.

## The database function is the authority (`0026_admin_role_management.sql`)

`set_organiser_role(actor, target, action, confirm_self)` — `security definer`,
executable by the service role only:

1. **One advisory lock** (`pg_advisory_xact_lock`) taken first, held to the end
   of the transaction. Every membership change in the system queues on it, so
   "two admins demote each other at the same instant" resolves as one then the
   other, and the second counts the rows the first left behind. A read-then-
   delete in the route could not give that guarantee.
2. **The actor is re-checked inside the lock.** Somebody demoted a moment ago,
   whose request was already past the route's check, is refused.
3. **The last admin cannot be removed.** The count is taken inside the lock.
   This check comes _before_ the self-confirmation check, so no flag a caller
   can send gets past it.
4. **Self-demotion needs `confirm_self`** even when other admins exist.
5. **The audit row is written in the same transaction.** Promotion, demotion
   _and every refused attempt_ (`organiser.promoted`, `organiser.demoted`,
   `organiser.demote_refused`, `organiser.change_refused`) — with who, whom,
   the role before/after and the admin count. Unlike the best-effort
   `recordAudit` used elsewhere (which swallows failures so an audit outage
   can't undo a check-in), here if the audit row can't be written **the change
   does not happen**: for this action the record matters more than the action.

### A second net: the table can never reach zero

A statement-level `AFTER DELETE` trigger with a transition table refuses any
delete that leaves `organisers` empty — from the SQL console, a future bug, or
a cascade. Statement-level on purpose: a row-level trigger sees the table as it
was when the statement began, so one `delete` of _both_ of two rows passes each
row's check and leaves none. Two deliberate consequences, both documented in the
admin guide: an empty table can still be _inserted into_ (bootstrapping the
first admin by hand still works), and **deleting the auth user of the last admin
is refused** because that cascades into `organisers` — add the next admin first.

## The route (`POST /api/admin/organisers`) — order of checks

Implemented as `handleRoleChange(request, deps)` in
`src/lib/admin/organiser-role-handler.ts` (the route file only wires in the real
collaborators, and Next only lets a route module export HTTP handlers):

1. **Same-origin + `application/json`** — before any session is read.
2. **Caller is an admin** (`currentOrganiser`, a live `organisers` lookup) — 403.
3. **Rate limit**, keyed to the person: 10 changes / 10 minutes. The **5th**
   change in a window is additionally flagged once, to the log _and_ the audit
   trail (`organiser.rapid_changes`), so a burst is visible later even though
   every change in it was allowed.
4. **Strict body** (zod `.strict()`): uuid, `promote|demote`, typed email,
   optional `confirmSelf: true`. Extra keys, `"true"` strings, etc. → 400.
5. **Target exists** — 404.
6. **The double-confirmation, on the server.** The screen makes you type the
   target's email before the button enables — but a direct request skips the
   screen, so the server compares what was typed with the real account's email
   (case-insensitive, trimmed, otherwise exact). A mismatch is refused and
   audited. An account with no email can never be confirmed, so never changed.
7. **The database function decides.** An unknown or missing verdict (RPC
   absent because 0026 isn't applied, DB down) → 500, nothing changed: **fails
   closed**.

`already_admin` / `not_admin` are 200 with `changed:false` — the requested
state already holds, so a double-click or a retry after a timeout is harmless.

## The screen

Admins are listed first, in full (unmasked addresses — here the address is the
point of the row), with _You_ marked. Both directions use a confirmation modal
in the style of the delete double-confirmation: promotion states plainly that
admin access is **full control** (content, financial data, other people's data,
and the power to make or remove other admins — including you); removal states
that it is **immediate** — the next request, including one already open in
another tab, is refused. Self-removal adds an explicit tick. When there is one
admin the remove button is **disabled with an explanation**; that is a courtesy
so nobody clicks into a refusal, not the protection — the server and database
refuse regardless.

## Verified — and what could not be

- **Unit tests (`tests/organiser-roles.test.ts`, in `npm test`)** drive the real
  handler with fakes: every refusal path, and that no refusal ever reaches the
  database function.
- **The database rules were proved on a real Postgres engine**
  (`tests/db/organiser-roles.db.ts`; PGlite, installed test-only with
  `npm i --no-save`, never a project dependency). It applies the real `0002`,
  `0011` and `0026` DDL to a scratch in-memory database and checks 38
  assertions: every rule, raw-SQL attempts to empty the table, audit atomicity,
  and **real `Request` objects through the real handler wired to that
  database** — e.g. `POST demote {sole admin, correct typed email,
confirmSelf:true}` → `409 last_admin`, admin still present. It is
  **mutation-checked**: with the function's last-admin check removed the trigger
  still holds (and the tests fail loudly); with the trigger removed the deletes
  succeed and the tests fail; with _both_ removed the API test reports
  `200 demoted` for the last admin — the lockout the whole design exists to
  prevent.
- **Not demonstrated: two connections racing.** PGlite is a single connection,
  so the advisory lock's serialisation is argued here, not shown. It is the
  standard mechanism (`pg_advisory_xact_lock`, the same one
  `create_payment_intent` already relies on, migration 0002), but it is the one
  guarantee not observed under contention.
- **Not run against production, by design.** The live `organisers` table is
  never written to by anything in this work, and migration 0026 is shipped as
  reviewed SQL, not executed. Consequently nothing here was exercised against
  the real Supabase RPC or a real signed-in organiser session.

## Consequences

- **Deploy order:** apply `0026` (`supabase db push`), then deploy the code. In
  the other order every attempt is a 500 and changes nothing.
- The first admin is still created by SQL (someone has to open the page).
- `admin_audit.actor` references `auth.users` without cascade, so an admin who
  has made role changes cannot have their auth user deleted while audit rows
  remain — pre-existing for every audited action, and the right default for a
  log meant to be durable.
- A promoted user gets access on their **next request** (the check is a live
  query); a removed admin loses it the same way. Their public-site session is
  unaffected.
