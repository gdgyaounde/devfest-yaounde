# 0077 — Collector DP frames, and one server-side paid-ticket entitlement

Date: 2026-11-15
Status: Accepted

## Context

Paid pass holders should get something the free pass does not, that people
actually share: two collector-edition DP frames. The DP generator is public
and needs no sign-in (ADR 0015/0034), and every existing frame is static
client data — anything defined in `frames.ts` ships in the bundle and can be
switched on from devtools. Nothing in the codebase answered "does this
person hold a paid pass?".

## Decision

### One entitlement helper

`getPaidTicketEntitlement(userId)` (`src/lib/tickets/entitlement.ts`,
server-only) over a pure rule, `paidEntitlementFrom`
(`entitlement-rule.ts`, unit-tested). Entitled = at least one ticket where
`user_id` is the signed-in user **and** (`is_self` **or** `claimed_at` is
set) **and** the tier's `priceXAF > 0` **and** no refund request with status
`resolved` matches its id, badge code or deposit id. The `is_self`/claimed
condition stops a buyer unlocking the frames through friends' unclaimed
tickets; buying for yourself too still counts. Haikyu (free, Bevy) has no
ticket row. Any read error fails closed. It reports the highest qualifying
tier, printed on the ticket-stub serial. Other perks can reuse it.

### Real gating

- The two definitions (`collector-foil`, `collector-stub`) live in
  `src/lib/dp/collector-frames.ts` behind `import "server-only"`, served by
  `GET /api/dp/collector-frames` — 401 signed out, 403 not entitled, 200
  with the definitions otherwise; `private, no-store`; rate-limited.
- The compositor takes a resolved `frame` object (`DpComposeInput.frame`),
  so collector frames render without ever entering the public catalog. The
  pattern routines (`foil`, `stub`) and the collector plate DO ship: they
  draw nothing unless a definition selects them.
- The wall (`POST /api/dp/gallery`) refuses a collector `theme`
  (`collector_locked`) unless the saver is signed in and entitled — the ids
  are public (`COLLECTOR_FRAME_IDS`), so this is the check that matters.

### Design

Both are flat and yellow-family (DESIGN.md §2.5/§2.6), bolder than the
public eight, each with an "Édition collector · DevFest Yaoundé 2026" plate
straddling the photo's top edge, embossed with flat offset layers only.
**Gold foil**: black ground, two flat yellows alternating in art-deco corner
fans, a double foil rule, diamond studs. **Ticket stub**: the card as a
ticket — security pinstripes, a die-cut notch, a perforated tear line, and
a vertical serial strip "TIER · Nº nnnn · DEVFEST YAOUNDÉ 2026" (the number
a stable hash of the nickname — decoration, not a credential). Checked at a
1080 square and a 2160 tall export.

### UI

The picker shows a "Collector edition" row first: the two frames with a
"Collector" tag for holders; two locked tiles ("For paid pass holders") for
everyone else, linking to `/tickets` while sales are open and to the ticket
FAQs after. The entitlement is fetched in the background and never blocks
the generator. The first time a holder's picker comes into view, the frames
pop in (`bouncyPop`, off under reduced motion) with an "Unlocked!" tag —
once per browser, via `useSeenOnce` (ADR 0074).

## Consequences

- Signing in is required to use the collector frames, and only for them.
- A refund granted after someone downloaded a collector card does not
  recall the file — it only stops new ones and wall posts.
- The Part E paid email announces these frames: send it after this ships.

## Amendment — 2026-11-16

Admins (rows in `organisers`) also get the collector frames, through
`getCollectorAccess()`: the paid-pass check runs first, so an admin who holds
a paid pass keeps their own tier on the strip; one who does not gets "TEAM".
The wall check uses the same function. Volunteers (ADR 0079) are not
included.

## Amendment — 2026-11-16 (later)

The two original frames (gold foil, ticket stub) and the tier/serial strip
are replaced by three new collector styles, a collector seal, photo shapes
and a typed badge — see ADR 0080. The gating described here is unchanged.
