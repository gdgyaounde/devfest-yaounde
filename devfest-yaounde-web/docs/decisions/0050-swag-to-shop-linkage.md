# 0050 — Swag items auto-create shop products, as unpublished drafts, unlinked rather than deleted on removal

Date: 2026-09-11
Status: **Superseded** (2026-09-14) by ADR 0054.

> **This model produced duplicates and has been removed.** Auto-creating a
> product per swag item meant five tiers each bundling a t-shirt created five
> separate t-shirt listings, none of them the one the shop already sold — 20
> auto-created products against 5 genuine ones in the live catalogue. The
> implementation did what this record specified; the model was wrong. A tier
> bundling a product is a _reference_, not an act of creation. See ADR 0054
> for the replacement and the migration. Kept for the reasoning below, which
> is still the best account of why unlink-not-delete and draft-by-default
> were the right calls _within_ this model.

## Context

Phase 20 asked that every swag item on a ticket tier also become a shop
listing, and flagged two decisions for the human to confirm before building
it: whether the auto-created product should publish immediately (visible but
incomplete) or start hidden, and left the removal behaviour ("decide and
document") to this record. Both were confirmed: **draft by default**, and
**unlink rather than delete** on removal.

## Decision

**`productSchema` gains two fields:**

```ts
published?: boolean;        // absent/true = live, false = draft
sourceSwag?: { tierId: string; swagId: string };
```

`published` follows the exact convention `hidden` already uses on
speakers/team — absent means visible, so every product written before this
field existed is still valid and still shown. `getProducts()` (the public
getter) now filters `published !== false`; a new `getAllProducts()` (same
get/getAll split as speakers/team) is unfiltered, for the admin dashboard.

**Creation runs inside the `ticket-tiers` write path, before it persists.**
`src/lib/content/swag-sync.ts`'s `syncSwagToShop(before, after, actor)` is
called from `PUT /api/admin/content/[id]/route.ts` only when
`id === "ticket-tiers"`, using the `before`/`after` payloads the route
already has. For every swag item without a `shopProductId`, it:

1. Creates a product: `{ id: "swag-<swagId>", name, images, priceXAF: 0,
status: "pre-order", published: false, sourceSwag: { tierId, swagId } }`.
2. Patches the swag item's `shopProductId` onto the tiers array **before**
   that array is written — so the saved payload and the newly created
   product agree about the link from the first write, never for one request
   in a half-linked state.

The product is deliberately incomplete on creation (price 0, no stock) and
**`published: false`** stops it from ever appearing on the live shop while it
is in that state — the flagged risk (publishing something a buyer could try
to pay 0 XAF for, or that renders with no price) never occurs, because
`getProducts()` never returns it. The admin who saved the tier gets a toast
naming how many drafts need finishing, and the swag editor shows a deep link
to each linked product's edit form (`/admin?view=shop&edit=<id>`).

**Removing a swag item from a tier unlinks its product; it never deletes
it.** The sync also runs the inverse pass: any product whose `sourceSwag`
pointed at a `(tierId, swagId)` pair that existed in `before` but is gone
from `after` gets `sourceSwag` cleared, and is otherwise left exactly as it
was. A shop listing that already has real stock, a real price, or has sold
units is inventory — an edit to an unrelated ticket tier must not make it
vanish. If an admin actually wants the listing gone, that is an explicit
delete on the Shop screen (Part B), which goes through the same
double-confirmation as every other admin delete (0052) and is blocked
outright if the product is linked to real orders.

## Consequences

- A tier's swag list and the shop catalog can never disagree about which
  product an item created, because the link is written in the same request
  that creates it.
- **What this does not do**: it does not touch a product manually created
  by an admin (no `sourceSwag`), and it never re-links a product to a
  _different_ swag item automatically — that would need a human decision
  about which listing is meant.
- A product cannot end up both unlinked and still claiming an origin: the
  unlink pass clears `sourceSwag` in the same write, so "linked" and
  "traceable to a removed swag item" are never two states to reconcile.
