# 0051 — Overall ticket capacity is its own figure, and only warns against tier caps

Date: 2026-09-11
Status: Accepted

## Context

Phase 20 asked for an admin-set "total tickets available" figure with a live
public counter, and flagged the relationship to the existing per-tier
`quantityAvailable` caps as a decision for the human: are these the same
number, does one enforce the other, or are they independent with a guard
against contradiction? Confirmed: **independent figures, with a non-blocking
warning when the tier sum exceeds the total.**

## Decision

**`settings.capacity: { total: number | null }` is a new, separate column**
(`site_settings.capacity`, migration `0020_ticket_capacity.sql`) — not
derived from summing tier caps, and not a cap either. `total: null` means no
capacity has been set, in which case nothing public renders (no "0 of 0"
counter, which would read as sold out).

**Per-tier `quantityAvailable` keeps doing exactly what it already did** —
the binding checkout gate, enforced in `create_payment_intent` (migration 0002) and the optimistic fast-fail in `quoteTierCounts`. Nothing about this
phase changes that. The overall total is a **display and admin-planning
number**, not a second enforcement point: checkout never reads
`settings.capacity` at all.

**The admin dashboard warns, never blocks, when the tier sum exceeds the
total.** Both `AdminTicketTiers` (editing tiers) and `AdminConfig` (editing
the total) compute `sum(tier.quantityAvailable)` and show an `InfoBanner`
when it is greater than `settings.capacity.total` — worded as "sales are not
blocked by this; each tier still enforces its own cap; the public counter
can undercount." Saving either screen while the warning is showing is not
prevented. The alternative (a hard validation error) was rejected because it
would tie two independently-editable settings together with a constraint an
admin might have a good reason to violate temporarily (raising one tier's
cap before remembering to raise the total) — the checkout-side truth is
never at risk either way, since it never reads this number.

**The remaining count is a real query, not a subtraction the client can
influence.** `src/lib/payments/capacity.ts#getTicketCapacity()` counts actual
rows in the `tickets` table (issued tickets — a ticket only exists once a
payment settles) and subtracts from `settings.capacity.total`, floored at
zero. `GET /api/tickets/capacity` (public, rate-limited by IP) exposes the
same function for `CapacityCounter`'s polling; the tickets page also calls it
server-side for the initial value, so the first paint needs no round trip.

**The odometer is hand-rolled**, per the phase's own stop condition against
a new animation dependency. Each digit is a fixed-height column of
"0123456789" translated with a CSS transition — a transition never animates
the value an element is first painted with, only a change on an
already-rendered element, so the roll only ever shows up on a real update
(a poll tick, or an admin edit), never on page load. `prefers-reduced-motion`
is read via `useSyncExternalStore` (not an effect + `setState`, which
`eslint-plugin-react-hooks`'s `set-state-in-effect` rule now flags) and swaps
the transition off entirely.

## Consequences

- Setting up the counter is two independent admin actions with no ordering
  requirement: set a total in Info bar & policies, or leave every tier cap
  as it is — either can happen first, and the warning is the only coupling
  between them.
- **What this does not do**: it does not prevent overselling by itself — that
  protection was already the per-tier reservation in `create_payment_intent`,
  unchanged. A total set far above the sum of tier caps is not an error; it
  just means the public counter will always show room the tiers themselves
  cannot actually sell, which the warning exists to catch instead.
