# 0065 — Bulk publish/hide/delete, retrofit onto every admin list at once

Date: 2026-09-16
Status: Accepted (PHASE22 §E) — extends ADR 0052

## What, and where

Multi-select checkboxes, bulk publish/hide, and bulk delete, added to
`EntityCrud.tsx` — the shared shell behind every editorial admin list
(speakers, team, sponsors, testimonials, FAQs, past editions, ticket
tiers, shop products, and whatever uses it next). Same reasoning ADR 0052
already used for double-confirmed delete: **retrofit the shell once,
not each view.** Every collection gets multi-select and bulk actions the
moment it renders through `EntityCrud`, with zero changes to any
individual view — `AdminTicketTiers.tsx`, `AdminShop.tsx`, and the rest
did not need to be touched for this to reach them.

Bulk publish/hide only appears for a collection that already passes
`rowToggle` (the same prop that drives the existing single-row toggle) —
there is nothing to bulk-publish on a collection that has no publish
concept. Bulk delete is universal, because single delete already is.

## One whole-array commit, not N round trips

Every save in this store is a whole-array `PUT` (ADR 0031) — there is no
per-record endpoint. That turns out to make bulk actions SIMPLER than N
individual ones, not harder: `bulkFlip`/bulk-delete compute the next
array with every affected row changed, then call the exact same `commit()`
single-row actions already use, once.

This is not just fewer requests. N separate writes would each run their
own concurrency check against a `baseline` the FIRST write already moved
past — writes 2..N would spuriously fail as "someone else changed this
list" against their own sibling, a self-inflicted false positive a
one-shot commit cannot produce.

## Bulk delete is at least as safe as single delete — not a shortcut around it

The phase's own cross-cutting rule. Concretely:

- **The confirmation is a typed word (`DELETE`), not a checkbox or a second
  click.** A single delete types the record's own id back (ADR 0052) —
  there is no equivalent single string for a set of different ids, so this
  asks for the word instead. Same idea, sized to a plural target: a
  deliberate second action a reflexive double-click cannot satisfy by
  accident.
- **A blocked row is never silently dropped from the count.**
  `describeImpact` — the same prop `AdminTicketTiers`/`AdminShop` already
  use to block a single delete (a tier with sold tickets, a product linked
  to real orders) — is checked per selected row. `ConfirmBulkDeleteModal`
  lists every blocked row by name and its exact reason, and the confirm
  button's own label states the REDUCED number that will actually be
  deleted (`Delete 2`, not `Delete 3`) — the difference between what was
  selected and what will happen is stated on the button itself, not
  something you'd only notice by counting rows afterward.
- **Selecting only blocked rows disables the action entirely**, with the
  reason stated ("Every selected record is blocked — nothing to delete"),
  rather than a confirm button that does nothing when pressed.

## Select-all is scoped to what a filter is showing, never the hidden rest

`EntityCrud` already draws a hard line between `rows` (the whole array,
what every save writes) and `shown` (`rows` narrowed by a view's own
`filter` prop — search text, a visibility chip). Select-all checks the
box in the SAME way: it selects every id in `shown`, never anything a
search box is currently hiding. A search for "Ada", followed by "select
all" and a bulk hide, must never reach the members of the list the search
box hid — the same principle `filter`'s own doc comment already states for
saving ("filtering upstream would mean saving a filtered list... here the
filter reaches the render and nothing else"), now also true of bulk
selection.

## The toast reuses each collection's own vocabulary, not a generic one

A generic "Published"/"Hidden" bulk toast would be wrong on
`AdminTicketTiers`, which calls the same concept "on sale"/"off sale," not
publish/hide. Rather than adding a new per-collection copy prop just for
bulk phrasing, the toast reads `rowToggle.label(!next)` — the SAME label
function each collection already supplies for its single-row button,
called at the state the action is moving FROM. Bulk-turning something on
reads `label(false)` (the verb shown on an off row — "Publish," "Put on
sale"); bulk-turning off reads `label(true)`. No new prop, and it can never
drift from what the single-row button already says.

## What this is not

- **Not a new confirmation component built from scratch.**
  `ConfirmBulkDeleteModal` reuses `ConfirmDeleteModal`'s exact focus-trap,
  Escape-to-cancel and backdrop-cancel behaviour — copied because the two
  serve different inputs (one id vs. a list with a blocked subset), not
  because the interaction model needed to change.
- **Not a second authorisation layer.** Same as ADR 0052 states for single
  delete: the confirmation is a UI safeguard against a misclick, not a
  server-side "are you sure" round trip. The actual write still goes
  through `PUT /api/admin/content/:id`, with its existing organiser gate,
  rate limit, Zod validation and audit entry, completely unchanged.

## Verified

- Screenshotted end to end against a harness mounting `EntityCrud`
  directly (mixed toggle state, one row carrying a blocking
  `describeImpact`): checkboxes on every row, the select-all checkbox
  correctly indeterminate with a partial selection, the bulk bar showing
  the right count and the collection's own verb on its buttons, and the
  delete confirmation correctly separating 2 deletable rows from 1 blocked
  one — including the blocked row's own reason text — with the confirm
  button disabled until `DELETE` is typed exactly and re-labelled `Delete
2` once it is.
- `npm run verify` (210 tests, lint, typecheck) and `npm run build` pass.
  The `tests/browser/admin.mjs` gate suite re-run against a real build,
  13/13 passing, including a new check that the refund-request tracker's
  write route (added in Part D, on the same shared admin-write pattern)
  still refuses a stranger.
- Not exercised against a live database with a real bulk write: no
  organiser credentials in this sandbox to reach the authenticated
  dashboard, and the standing rule against writing to the production
  database applies regardless. The write path itself is untouched code
  (the same `commit()` every already-shipped single action already uses),
  so this is a lower-risk gap than it would be for genuinely new server
  logic.

## Consequences

- Any FUTURE `EntityCrud`-based list gets bulk actions automatically — the
  only per-view decision is whether to pass `rowToggle` (which decides
  whether bulk publish/hide appears) and, optionally, `describeImpact`
  (which decides whether some rows can be bulk-blocked from delete).
  Neither is new to this part; both already existed for the single-row
  case.
- Collections that use `EntityCrud` with `reorderable` keep their reorder
  arrows alongside the new checkboxes — the two do not conflict, since
  selecting a row never changes array order.
