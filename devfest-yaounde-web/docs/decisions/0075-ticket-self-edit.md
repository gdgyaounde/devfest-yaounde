# 0075 — Ticket holders edit their own name and T-shirt size, until the cutoff

Date: 2026-11-15
Status: Accepted

## Context

Apparel sizes and the name printed on the identifier were fixed at checkout.
A wrong size meant an email to the organisers and a manual database edit,
and the organisers order shirts from these sizes. Ticket edits close with
sales: Wednesday 18 November 2026, 23:59 Yaoundé (`ticketing.editsCloseAt`,
ADR 0072).

## Decision

### What, who, until when

- **Editable:** `attendee_name` and `apparel_size` (XS–XXL, only on a tier
  that `includesApparel`). **Not** the email, tier, badge code or anything
  money-related; the phone lives on the payment intent and is out of scope.
- **Who:** the signed-in user whose id is `tickets.user_id` — the buyer for a
  ticket they bought for someone else and nobody has claimed, the attendee
  once it is claimed (0024).
- **Until:** `ticketEditsOpen()`. Also refused on a checked-in ticket and on
  one with a refund request that is `requested`, `in_progress` or `resolved`.
  `refund_requests.reference` is free text, so it is matched against the
  ticket id, badge code and deposit id, case-insensitively.

### How

`PATCH /api/account/tickets/[id]`: `currentUser()` → per-user rate limit
(`ticketEdit`, 20 / 5 min) → load through the **session** client, then
`ownedTicket()` — RLS lets organisers read every ticket, so "RLS returned it"
is not ownership; anybody else's ticket or a junk id is a **404, not 403** →
a **strict** Zod body (unknown keys are a 400) → `decideTicketEdit()` →
update with the **admin** client (no client UPDATE policy is added on money
tables) → an `admin_audit` row (`ticket.self_edit`, before/after; the audit
table takes any signed-in actor, so no `updated_at` column was added).

All rules are pure functions in `src/lib/tickets/self-edit.ts`, tested
without a database.

### UI and awareness

`/account`: an "Edit" action per ticket opens a small form — the shared
`Modal` on desktop, the shared `BottomSheet` on a phone — with a persistent
"You can change this until Wed 18 Nov, 23:59" hint, confirmed with
`ui/Toast`. A locked ticket says why (edits closed — contact us; already
checked in; refund pending). The cutoff flips live (`useBeforeInstant`).

People hear about it from the sales-close banner, the tickets-page notice,
the FAQ "Can I change my T-shirt size?" (ADR 0074), the receipt email (one
line + account link, only while edits are open — new orders only) and the
Part E update email.

### Admin

`AdminTickets` already reads the live row, so the list and its CSV show the
latest size. A new **Apparel sizes** panel totals every ticket (paged past
the 500-row list and PostgREST's 1,000-row cap) per tier × size, with "no
size" counted, and exports as CSV — per tier because the item differs by
tier. Export it after the edits cutoff.

## Consequences

- Sizes can change until Wednesday night; orders placed with the printer
  before then may need a top-up.
- A ticket whose refund request is `denied` becomes editable again.
- Organisers still fix things by hand after the cutoff ("contact us").
