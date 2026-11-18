# 0052 — Every admin delete goes through one shared, double-confirmed modal

Date: 2026-09-11
Status: Accepted — extended by 0065 (bulk delete, same double-confirmation standard)

## Context

`EntityCrud.tsx` — the shared shell behind every admin list (speakers, team,
sessions, sponsors, faqs, quotes, past-editions, and now ticket tiers and
shop products) — confirmed a delete with a single extra click: pressing the
trash icon swapped it for an inline "Delete" pill, and pressing that deleted
immediately. Phase 20 required double validation everywhere in admin: a
deliberate second action (not a second click), a stated consequence where
one exists, and a hard block where deleting would break data integrity (a
tier with sold tickets, a product linked to real orders).

## Decision

**One component, `ConfirmDeleteModal`, reached from `EntityCrud`'s existing
`confirming` state** — not a per-view reimplementation. Because every
existing entity list already runs through `EntityCrud`, this single change
retrofits double-confirmation onto all of them at once, which the phase
explicitly asked for ("retrofit if currently single-confirm") rather than
leaving older screens on the previous single-click behaviour.

**The deliberate second action is typing the record's id**, not a second
button. A modal with two buttons is still one motor action away from a
mis-click if both buttons are reachable by the same reflexive click-click;
requiring the id to be typed (case-sensitive, exact match) forces a pause
that a double-click cannot accidentally satisfy. The id is shown in the
prompt, so this is "type what you see," not a memory test.

**A new optional `describeImpact` prop lets a specific view block or explain
a delete**, without every entity needing to know about it:

```ts
describeImpact?: (row: T) => { blocked: boolean; message: string } | null;
```

Returning `null` (the default for every entity that doesn't pass this prop)
means "no integrity concern, just the standard double-confirmation."
Returning `{ blocked: true, message }` disables the confirm control entirely
and states why — used by `AdminTicketTiers` (a tier with sold tickets cannot
be deleted; turn off "On sale" or mark it sold out instead) and, in Part B,
`AdminShop` (a product linked to real orders cannot be deleted).

**Keyboard-accessible and cancellable**: `Escape` closes it, a minimal focus
trap keeps `Tab` inside the dialog, and the backdrop click also cancels —
matching the existing `EditorDrawer`'s own escape/backdrop behaviour rather
than inventing a second convention.

## Consequences

- Every admin entity gets double-confirmation and integrity-aware blocking
  "for free" the moment it uses `EntityCrud` — a new entity list does not
  need to remember to add this.
- The `confirming` state's shape (a row id) did not change, so this is a
  rendering change at the point `EntityCrud` already tracked which row was
  pending deletion, not a new state machine.
- **What this does not do**: it does not add a server-side "are you sure"
  round trip — the double-confirmation and the impact check are both
  client-side, reading data (like sold-ticket counts) that is already loaded
  into the admin dashboard's props. A determined direct API call still goes
  through the collection's normal write path, which has its own
  organiser-gate, rate limit and audit log; this modal's job is specifically
  to stop a _misclick_ in the UI, not to be a second authorisation layer.
