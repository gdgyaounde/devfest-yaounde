# Backend ⇄ UI map: what can be wired for real, and what cannot

**As of 2026-08-31, `6be72fc`.** Companion to `docs/backend/OVERVIEW.md`.

This is the map that decides, screen by screen, whether Phase 14 wires a flow
to the real backend or marks it pending. The rule it enforces:

> **Where the backend supports a flow, wire it for real. Where it does not,
> build the UI, mark it visibly pending, and record it here — never fake a
> success as if it happened.**

A faked confirmation is worse than a missing one. Someone who believes they
hold a ticket and does not is a problem at the door, not on the screen.

---

## Summary

| Flow                        | Backend                   | Phase 14 does                    |
| --------------------------- | ------------------------- | -------------------------------- |
| Ticket tiers → checkout     | **Complete**              | Wire for real                    |
| Free-tier checkout          | **Complete**              | Wire for real                    |
| Mobile Money payment        | **Complete**              | Wire for real                    |
| Payment settlement + QR     | **Complete**              | Wire for real                    |
| Google sign-in              | **Complete**              | Wire for real                    |
| Account: tickets & orders   | **Complete**              | Wire for real                    |
| Shop catalog → checkout     | **Complete**              | Wire for real                    |
| DP generator                | **Complete**              | Wire for real (no server at all) |
| **Card payment**            | **Absent**                | Not offered — see G1             |
| **Refunds / cancellation**  | **Absent**                | Not offered — see G2             |
| **Email receipts**          | Code done, provider unset | Wire; degrades silently — G3     |
| **Discount code preview**   | **Complete**              | Priced before payment — G4       |
| Organiser check-in / orders | **Complete**              | Screens built — G5 resolved      |

**Most of this is buildable for real.** The gaps are narrow and specific.

---

## The gaps

### G1 — Card payments do not exist

`PAGES.md` §7 asks for card as a secondary option. The integration is Mobile
Money only, and whether PawaPay covers cards or a second gateway is needed
**has not been investigated** (`remaining-work.md` §2).

**CLOSED 2026-09-03: Mobile Money only, definitively.** Nothing to remove —
no card option is rendered at all, not even disabled. A greyed-out button that never works reads as a bug
on someone's phone rather than a decision.

Card support would need a separate processor aimed at diaspora buyers. That is
a future decision, explicitly not this phase.

### G2 — No refunds or cancellation

<!-- Deferred 2026-09-02 to a future phase. -->

**CLOSED 2026-09-03: there are no refunds.** That is the policy, and it is now
recorded as evidence on every order (ADR 0022). Cancelling moves no money;
`amount_mismatch` still needs a human.

**Phase 14 does:** no cancel/refund control in `/account`. Orders are
read-only. The `amount_mismatch` state gets copy that says the team is looking
into it and **does not offer a retry** — the guide is explicit that retrying is
wrong there.

**2026-09-16 addendum:** the policy still stands — nothing above changed.
What organisers gained is a place to LOG a manual refund/exchange request
that comes in by email and track its status (_Commerce → Refunds &
exchanges_). It does not move money, does not touch a ticket or order, and
does not add a self-service request path for buyers. ADR 0064.

### G3 — Email provider not chosen — **CLOSED 2026-09-16**

Templates and dispatch are written and bilingual; Resend is wired as the one
adapter. **Without `RESEND_API_KEY` nothing sends** — the payment still
completes, the ticket still exists, and `payment_events` records
`receipt_skipped`.

**DECIDED 2026-09-02:** don't promise an email that cannot send. The on-screen
QR and badge code are the source of truth; email is mentioned **only** when
`RESEND_API_KEY` is actually configured. The badge code also lives in
`/account`, so the ticket is reachable either way. This is a config gap, not a
code gap.

**CLOSED 2026-09-16 by ADR 0062:** Resend is now the actual, final answer to
"which provider," not just the one adapter wired in for lack of a decision.
Nothing about the code changed — the two-path shape (configured → sent,
unconfigured → logged and skipped) was already correct. What changed is that
the choice is now on record rather than left open.

### G4 — Discount preview — ~~absent on purpose~~ **CLOSED 2026-09-04**

<!-- Confirmed 2026-09-02: apply at submission, reflect the server's verdict. -->
<!-- Reversed 2026-09-04: the buyer saw the real total only on PawaPay's page. -->

~~There is deliberately no "check this code" endpoint: it would be a free
oracle for guessing codes.~~

**Reversed by ADR 0036.** The reasoning above was sound; the conclusion was
too strong. The oracle already existed — anyone could POST a real checkout
and read `discount_invalid` off the response — so refusing to build a preview
only made each guess cost a payment intent. The fence was always the rate
limit, never the absence of an endpoint. Meanwhile the buyer learned what
they owed for the first time on PawaPay's page, after committing to pay it.

**Now:** `POST /api/checkout/quote` prices a basket without committing to it.
The summary shows subtotal, the deduction with its code, and what is left to
pay; the code can be removed and another tried until payment. Sign-in is
required, every call is metered, and **only a rejected code charges the
brute-force fence** — every guess is wrong, so guessing still costs, while a
buyer re-pricing their own basket does not.

A quote holds nothing. The redemption is still claimed at payment time, once,
inside `create_payment_intent`, so a code accepted for a quote can still be
refused at checkout — the screen keeps the basket and says why.

### G5 — Organiser tools are unbuilt (backend ready) — RESOLVED

Resolved 2026-11-15: the door scanner is `/admin/check-in` (ADR 0078) and
order status is managed from **Admin → Shop orders**. Kept below for history.

<!-- Deferred 2026-09-02 to a future phase. -->

`POST /api/check-in` and `PATCH /api/orders/:id/status` both work and are
access-controlled server-side. The scanner and back-office **screens** do not
exist.

**Phase 14 does:** nothing — they are outside the three parts. `isOrganiser`
comes back from `/api/account/profile` if a later phase wants them. Also note
`remaining-work.md`: **check-in requires a connection**; an unreliable venue
network needs planning before the day.

### G6 — QR rendering — RESOLVED

The badge code is issued and shown; **the QR image is not drawn**, because
every reasonable way to draw one needs a call this phase cannot make alone:
a library (an ADR and a go-ahead), a hand-rolled encoder (several hundred
lines of Reed-Solomon, wrong-but-plausible output discovered at the door), or
an external service (which would send the credential to a third party).

**Phase 14 does:** renders the badge code as large, selectable text on the
confirmation screen and in `/account`. That is required regardless — a cracked
screen still has to get someone in — so what is missing is the convenience of
scanning, not the ability to enter.

**RESOLVED 2026-09-02.** [ADR 0020](../decisions/0020-qr-rendering.md)
approved; `qrcode` renders the badge client-side, with the readable code kept
alongside it.

### G7 — No per-attendee phone — CLOSED, no change wanted

The brief asked for "phone AND/OR email, at least one" per attendee. The server
does not allow it: `attendeeSchema` **requires** `email` and has **no phone
field at all**. Only the order-level `contact.phone` exists, and it is used
solely to pre-fill the PawaPay page.

**Phase 14 does:** requires the email (as the server does), and collects an
optional phone per attendee for the buyer's own record — clearly labelled
optional, and **not sent**, because there is nowhere to put it.

**DECIDED 2026-09-02: leave it.** Receipts go by email, which is the normal
way to reach a ticket holder, so email stays mandatory and no per-attendee
phone column is added. The optional phone the UI collects for the buyer's own
record is still not sent, and that remains correct.

### G8 — "This one's mine" — RESOLVED

Self-assignment drives **prefill only**. Nothing records which ticket belongs
to the buyer, so `/account` cannot distinguish "my ticket" from "a ticket I
bought for someone".

**RESOLVED 2026-09-03** (migration 0008,
[ADR 0025](../decisions/0025-ticket-ownership.md)). `tickets.is_self` records
which ticket the buyer kept. `user_id` says who paid; this says which one is
theirs to use. At most one per order, zero is valid, and it is not a security
claim — it grants nothing and is not checked against the signed-in address,
because paying with one email and wanting another on the badge is a real case.

Verified live: an order with one self and one other produced exactly one
ticket flagged.

### G9 — The non-refundable acknowledgment — RESOLVED

The checkbox gates the pay button in the browser. There is no field for it in
`ticketCheckoutSchema`, so a request posted directly to the API succeeds
without it.

**Phase 14 did:** ship the gate, because it is the right UI, without
pretending the consent was recorded.

**RESOLVED 2026-09-02** — decided that it must be evidence.
[ADR 0022](../decisions/0022-terms-consent-record.md): both schemas now
require `acceptedTerms: true`, and `payment_intents` stores
`terms_accepted_at` (the server's clock) and `terms_text` (the exact wording,
re-read server-side from the messages for that locale — never from the request
body). Tickets and goods record their own separate wording.

### G10 — The Bevy URL — RESOLVED

The free tier now sends people off-site to RSVP, and `BEVY_URL` in
`src/lib/site-config.ts` is `"#"`. **The free-pass CTA currently links
nowhere.**

**RESOLVED 2026-09-02.** `BEVY_URL` now points at the chapter's event page,
and the free-pass CTA was verified to reach it in both locales.

### G11 — Products have no `category` field

The brief asked for a category filter. `Product` carries `id`, `name`,
`description`, `priceXAF`, `images`, `variants` and `status` — **no category**,
and nothing server-side groups products.

**Part B does:** filters on **`status`**, which is real and is what actually
changes what someone can do, plus a search across name and description.
Inventing categories client-side would mean filtering on data the server does
not have, and they would drift the moment the catalog is edited.

**ACCEPTED 2026-09-02.** Availability + search is the filter. Categories are a
backend item, left documented.

**Deferred again 2026-09-02:** they will be packages rather than plain
categories, and the shape is not settled. Nothing to build until it is.

### G12 — No per-variant inventory — RESOLVED

The brief asked for out-of-stock variants to be individually disabled. The
catalog has **one `status` per product** and no per-variant stock, so there is
nothing to disable a single size against.

**Part B does:** shows and enforces availability at the PRODUCT level. When a
product is unbuyable the whole control set is disabled and says why, which is
the truthful version of the same intent. It does not grey out individual sizes
on a guess.

**RESOLVED 2026-09-02** (migration 0007,
[ADR 0024](../decisions/0024-per-variant-stock.md)). `Product.stock` lists
combinations with a quantity, declared in JSON and counted in the database —
the same split as tier capacity. Checkout reserves per combination under an
advisory lock, and refuses with `variant_sold_out:<product>|<size>|<color>`.

Verified live: a combination stocked at 8 took 8 and refused the 9th.

**The UI half is now possible and not done.** `variant_taken()` gives the
remaining count per combination, so greying out a single size is no longer a
guess — it is a frontend change with real data behind it.

### G13 — Fulfilment cannot be chosen by the buyer — RESOLVED

Orders **do** carry a `fulfilment` column — free-form JSON with
`method: "pickup" | "shipping"`, a note and a reference. But it is written
**only by organisers**, through `PATCH /api/orders/:id/status`.
`shopCheckoutSchema` has no fulfilment field, so a buyer's choice has nowhere
to go.

**DECIDED 2026-09-02:** the interactive choice was **removed**. A
pickup-vs-delivery control that sends nothing is a fake control — it invites a
decision and then discards it, which is worse than not asking. In its place is
an honest line: the team coordinates pickup or delivery after checkout.

**RESOLVED 2026-09-02** (migration 0006, [ADR 0023](../decisions/0023-buyer-requested-fulfilment.md)).
`shopCheckoutSchema.fulfilment` accepts a method (`pickup` | `shipping` — the
same two words organisers already write) and an optional note, capped at 300
characters. It rides on the intent and is copied onto the order under
`requested` at fulfilment.

The control is back on the screen, and this time it is real. Still a
**preference, not a shipping engine**: no zones, no fees, no windows — those
remain open (`PAGES.md` §11) and the copy still says the team follows up.

One thing that had to change alongside it: `PATCH /api/orders/:id/status`
used to **replace** the whole `fulfilment` column, which would have erased the
buyer's request the first time an organiser added a courier reference. It now
merges.

### G14 — Shop return policy — RESOLVED (consent persistence folded into G9)

**DECIDED 2026-09-02:** goods get their **own** terms — no refund for a change
of mind, but replacement for damaged, faulty or wrong items, and size exchange
on apparel while stock lasts. Exchanges are handled manually, off-platform.
Copy, FAQ and the shop's acknowledgment wording all say this;
`docs/content/refund-policy.md` records it as settled.

No backend was needed, and none was written: this is a policy someone honours,
not a feature.

What remains is **not** a shop-specific gap — the acknowledgment is a
client-side gate with no server record for tickets and goods alike. That is
**G9**, and it stays a backend-phase item.

### G15 — The bag is device-local

There is no cart on the server: `POST /api/checkout/shop` takes the whole
basket in one request. The bag therefore lives in `localStorage`.

**ACCEPTED 2026-09-02.** `localStorage` stands; a server cart is a
low-priority backend item.

It persists across navigation and reload on that device, and syncs between
tabs. A bag started on a phone does not appear on a laptop, and clearing site
data empties it — so nothing in the UI calls it "saved to your account", and
nothing should start.

### G16 — Community handles in the DP caption — RESOLVED

`PAGES.md` §9 asked the share caption to carry "prefilled caption + event
hashtag + community handles". Two of the three shipped. The handles did not,
because every entry in `SOCIAL_LINKS` is still `"#"` and guessing an `@name`
tags a stranger on every post someone makes.

**Amended 2026-09-04 by ADR 0034 / Phase 18:** the caption now includes
`@gdgyaounde` as well as the CTA URL. The handle was asked for explicitly.

### G17 — The DP photo mask is not the morphed shape

`PAGES.md` §9 asks for the morphed-shape motif on the frames. The frames
themselves are now real artwork — eight designed combinations of confetti,
brackets, halftone fields, tape, stripes and dashed rings, drawn by the
compositor (PHASE15 §3). **What is still plain is the photo MASK**: `DpMask`
offers `rounded` and `circle` only, per ADR 0015 and the standing instruction
in `DESIGN.md` §4.2 not to approximate the signature shape until the real asset
exists.

**OPEN — asset, not code, and narrower than it was.** When the shape arrives,
`DpMask` and `maskPath` in `compose.ts` are the two places that change; the UI
needs no edit, because the picker renders whatever `DP_FRAMES` contains and the
swatch already draws each frame's mask shape.

### G22 — Nothing records what an organiser did

`payment_events` logs the payment lifecycle. It does not log **people**. The
two privileged writes that exist — moving a shop order along
(`PATCH /api/orders/:id/status`) and moderating a card
(`PATCH /api/dp/gallery/:id`) — change a row and leave no actor, no before,
and no history.

For a back-office several volunteers can reach, where the state being changed
is money-adjacent and the moderation decisions are about people's faces, "who
marked this delivered?" and "who deleted that card?" have no answer.

**RESOLVED 2026-09-03** (migration 0011, ADR 0031). `admin_audit` records
actor, action, target, before/after, timestamp. Order status, check-in, wall
moderation, content publish, settings and discount writes all insert a row
after they succeed. An audit failure is logged and swallowed so a door scan
is never blocked by the log.

### G21 — The wall has no report path for visitors

**REVISED 2026-09-04.** Visitor report buttons came off the cards. Takedown
is email to gdgyaounde@gmail.com; organisers hide a card from the admin
wall (click to toggle `visible`). The report endpoint may still exist; it
is not offered in the UI.

### G20 — The community wall — BACKEND BUILT

Asked for in this phase: people save their creations, and the chapter shows
what the community made. The frontend is written and switched OFF — with
`NEXT_PUBLIC_DP_GALLERY` unset the screen renders no wall control at all,
because a button that quietly fails is worse than no button (the same rule
that removed the fake fulfilment picker in G13).

**BUILT 2026-09-03** (migration 0009, [ADR 0026](../decisions/0026-dp-community-wall-backend.md)):
`POST /api/dp/gallery`, `GET /api/dp/gallery`, `DELETE /api/dp/gallery/:id`,
plus the queue — `GET /api/dp/gallery/pending` and
`PATCH /api/dp/gallery/:id` — the `dp_cards` table and the private
`dp-cards` bucket.

Verified against the live project: a real JPEG is accepted and re-encoded,
text claiming to be an image is refused, oversized dimensions are refused, a
pending card is invisible, **anonymous reads return nothing approved or not**,
approval publishes it behind a signed URL, the right takedown token matches
and a different one does not, and a removed object stops being served.

**The wall page shipped (ADR 0030) and the flag is on (ADR 0033).** Reports
land in the dashboard (G21). The pending queue is still an API, and is empty
by design while auto-approval is on.

**Fully specified** in `docs/backend/dp-gallery-contract.md`: the table with
its consent record, the three endpoints, validation order, rate limiting
through the existing `bump_rate_limit`, and the no-account takedown token.
Supabase Storage is recommended over S3 — the project already has Supabase
with RLS and a rate limiter, and the only AWS dependency is SSM for one
parameter.

**This reverses part of ADR 0015**, which said a gallery "should be a new
decision record, not a quiet feature addition". That record is ADR 0021, and
it also un-annotates the "Uploads (DP Generator)" section of the security
checklist, which applies again.

**Timing decided 2026-09-02:** the wall goes on once people are actually
producing cards — not before. Building the endpoints ahead of that is fine;
turning the flag on is what waits.

**The blocking item is still not code.** The wall publishes photographs of
people's faces on a public page. Review before publication, a takedown path and a
retention rule all have to exist, and someone has to run the queue. If that is
not in place, the honest move is to leave the flag off.

**Retention settled 2026-09-03: 200 days**, purged by the existing cron —
image first, row second. Pending and rejected cards are swept too: a card
nobody reviewed in two hundred days is not a reason to keep a photograph.

**What is still not code:** someone has to work the queue, and there has to be
a way to honour a takedown from a person who lost their token.

### G19 — Role badges — CLOSED, not wanted

The DP generator offers attendance badges only — "I'll be there", "Count me
in", "My first one", "Back again". **"Speaker", "Organiser" and "Volunteer"
are deliberately absent.**

They are claims about a role, and the generator has no login, no session and
no backend by design (ADR 0015), so there is nothing to check them against. A
self-selectable Speaker badge means anyone can wear one, which devalues it for
the people who actually earned it — worse than not offering it at all.

**DECIDED 2026-09-02: attendance only.** No verification method was supplied,
and the phase's instruction was to default to this.

**CLOSED 2026-09-03: not wanted, now or later.** The attendance badges — "I'll
be there", "Count me in", "My first one", "Back again" — are the whole set, in
both languages. If a role badge is ever needed, the team will hand out a
dedicated link rather than add a selectable one here.

Kept for the record, the two routes that would have existed:

1. **A per-role unlock code** handed to real speakers and organisers. Weak
   security — one leak and it is worthless — but arguably enough for a vanity
   badge. It is a frontend change plus a place to keep the codes, and it MUST
   ship with a plain line saying it is a soft check, not verification.
2. **Real verification**, once the badge can be tied to an account: the ticket
   tier or a role column would say who is what. That is a backend item, and it
   depends on G7/G8 (identity and ticket ownership).

Either way, `DP_BADGES` in `src/lib/dp/frames.ts` and one input are where it
lands. Until then the picker explains on-screen why role badges are missing,
rather than leaving people to wonder.

### G18 — The DP frame art is drawn in code, not by a designer

The eight styles are compositor primitives arranged by hand — patterns,
stickers, edge treatments and photo effects, all honest, on-brand and flat per
DESIGN.md §2.6. Nobody with a design tool has looked at them.

**CLOSED 2026-09-03: accepted as they are.** No designer pass is wanted. If
real frame artwork is
ever supplied as images, it needs a new decoration kind (an image layer) in
`compose.ts` and an asset pipeline — the current vocabulary is vector drawing
only. That is a bigger change than adding another entry to `DP_FRAMES`, so it
should be a decision rather than a quiet extension.

---

## Content, not code

Every ticket tier and product's **values** are still invented placeholders —
the prices, perks, entitlements and swag. Shape comes from `PAGES.md` §7; the
values do not come from anyone. `HAIKYU`, `SONNET`, `OPUS`, `FABLE`, `MYTHOS`
themselves are settled as the tier identity (the Claude-model naming), not a
placeholder.

**Phase 14 built** against the real files and their real shape, without
dressing the numbers up as confirmed. **Phase 20 made tiers admin-editable**
(dashboard → Ticket tiers) — replacing the placeholder values is now a
dashboard edit, guided by `docs/guides/updating-tickets-and-shop.md`, and it
must still happen before a real sale (`remaining-work.md` §1, item 8). Shop
products remain a JSON file edit until Part B's Shop screen ships.

---

## Config that blocks a real sale

None of this is code, all of it fails quietly, and **none of it is Phase 14's
to do** — it is listed so the UI work is not mistaken for readiness. Full table
in `docs/setup/remaining-work.md` §1.

The two that bite hardest:

- **`BADGE_CODE_SECRET` must be set and never change.** Every badge code
  derives from it, so rotating it invalidates every ticket already sold.
- **The AWS relay must point at this app.** Otherwise payments succeed, money
  leaves accounts, and nobody gets a ticket — with no error anywhere.

Settlement now happens primarily by **polling** (ADR 0019), so the payment
return page carries real weight: it is what issues the ticket while the buyer
watches. A five-minute sweep catches anyone who closed the tab.

---

## The one thing the backend points at that does not exist

**`/{locale}/payments/return`.** PawaPay sends every buyer there after paying,
and there is no page behind it — today they land on a **404 holding a completed
payment**.

This is the highest-priority screen in Part A, ahead of the tier cards.
