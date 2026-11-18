# 0054 — Swag references shop products; it does not create them

Date: 2026-09-14
Status: Accepted — **supersedes ADR 0050**; **amended by [0070](0070-ticket-only-products-and-nav-tabs.md)** — a tier's swag now resolves against published products _including_ ticket-only ones, which are deliberately not in the shop

## What went wrong

ADR 0050 made every swag item on a ticket tier auto-create its own shop
product, as an unpublished draft. It was careful about the things that
usually bite — the draft never reached the public shop, removal unlinked
rather than deleted, the link was written in the same request that created
the product — and none of those were the problem.

The problem was **duplication**, and it showed up the moment real tiers were
entered. Measured in the live database before this change:

|                                      |                                                 |
| ------------------------------------ | ----------------------------------------------- |
| Shop products total                  | **25**                                          |
| Genuine, hand-authored listings      | **5**                                           |
| Auto-created from tier swag          | **20**                                          |
| Distinct listings for "T-shirt"      | **5** (`tee-edition` + four `swag-*-tshirt`)    |
| Distinct listings for "Sticker pack" | **5** (`sticker-pack` + four `swag-*-stickers`) |

Five tiers each bundling a t-shirt produced five separate t-shirt products,
none of which was the t-shirt the shop already sold. The catalogue was 80%
duplicates, and every further tier edit could mint more.

This is not a bug in the implementation — the implementation did what 0050
specified. It is the model being wrong: **a tier bundling a product is a
reference, not an act of creation.** Four tiers including the same t-shirt is
one t-shirt mentioned four times.

## Decision

A tier stores **shop product ids**, and the admin **picks from what the Shop
already holds**.

```ts
// before (0050)                      // now
swag?: TierSwagItem[]                 swagProductIds?: string[]
//     ^ name, images, shopProductId  //                ^ ids only
```

- `productSchema.sourceSwag` is **gone**. A product no longer records that a
  tier made it, because no tier makes one.
- The tier editor's swag field is a **picker**: search the catalogue, attach,
  reorder, detach. It has no way to create a product, which is what makes the
  duplicate impossible rather than merely discouraged.
- Detaching a product from a tier does nothing to the product — which is what
  0050 wanted `unlink` to mean, now true by construction instead of by a
  synchronisation pass.
- The public preview renders the **attached products'** name and image, so a
  tier cannot advertise swag that disagrees with what the shop sells: there
  is one copy of that text, not two.
- `getProducts()` (published only) feeds the public preview, so an id
  pointing at a hidden or deleted listing resolves to nothing and is skipped.
  A dangling reference never blanks out the rest of a tier's preview, and the
  admin picker flags it in red rather than silently dropping it.

### Why the empty state is the right outcome, not a regression

Every `shopProductId` in the live data pointed at one of the 20 auto-created
drafts, all of which this change deletes. So **every tier migrates to an
empty swag list**, and the public tier cards show no swag until an organiser
attaches real listings.

That is deliberate. The alternative is guessing that the swag item named
"T-shirt" meant `tee-edition` — and a guess that attaches the wrong product
to a paid tier is worse than showing nothing, because it is wrong in a place
where someone is deciding what to buy. Four of the eight swag names
(notebook, bottle, cap, lanyard) have no shop product at all, so even a
name-match would only half-work and would quietly drop the rest.

Re-attaching is now seconds of picking per tier, and it is the organiser who
knows which listing is meant.

## Migration

`supabase/migrations/0021_swag_reference_model.sql`, in order:

1. Snapshots both payloads into `editorial_migration_backup`.
2. Deletes auto-created products (`sourceSwag` present) **that nothing has
   ever been ordered from** — an ordered one is inventory with a real
   transaction behind it, and `order_items.product_id` would be left naming
   a product that no longer exists.
3. Strips `sourceSwag` off survivors.
4. Rewrites `swag` → `swagProductIds`, keeping only ids that still resolve.

**Order matters, and so does deploying first.** The migration must run
_after_ this code is live. Run against the old code, the pre-existing
swag-sync would simply re-create the drafts on the next tier save, and the
public preview — still reading `tier.swag` — would go blank.

## Verified

- **Order safety, checked not assumed:** `order_items` holds **0 rows**, so
  all 20 auto-created products were confirmed safe to delete before anything
  was written.
- **Dry run against the live payload** (read-only): 25 products → 5, no
  `sourceSwag` left, no tier keeping a `swag` key, all five tiers → `[]`.
- Both migrated payloads **parse against the live Zod schemas**.
- Public preview resolves ids → products and renders name and image from the
  product, with a deliberately-dangling id correctly skipped (4 attached → 3
  rendered).
- Picker verified in a browser: attach, detach, reorder, search, the
  "(hidden in shop)" marker, the dangling-reference warning, and the
  no-products-yet empty state pointing at Shop.

**Not verified:** the SQL itself has not been executed — there is no
Postgres or Docker in the authoring sandbox, and the Supabase JS client
cannot run arbitrary SQL. The _rules_ it encodes were dry-run in JS against
the real payload and produce the table above; the SQL expressing them is
reviewed, not run. Read the backup table it writes as the safety net it is.
