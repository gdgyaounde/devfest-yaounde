# Refund and exchange policy

**Two policies, because a seat on a day and a hoodie are not the same thing.**

## Tickets — non-refundable

**Tickets are non-refundable and non-cancellable once paid.** Not for a change
of plans, and not after the event.

A paid ticket **can be transferred**: the buyer tells us the new attendee's
name before the day and we reissue it in that name. That is the release valve,
and it is the reason a flat no-refunds rule is defensible rather than harsh.

The free tier is not affected — it is an RSVP on the community platform, not a
purchase, and nobody has paid anything to release.

**Two different things, both called "transfer" loosely — worth keeping apart
(ADR 0062):**

- **Changing who's attending** — a different person entirely from who was
  named at checkout — is the manual process above: the buyer tells us, we
  reissue. Still true, still support-handled, unchanged by anything below.
- **The already-named attendee getting their own account access** to a
  ticket the buyer bought FOR them (never for themselves) is now
  self-service: they get an emailed "claim your ticket" link, sign in with
  Google, and it's linked to their own account from then on — they can see
  it under `/account` and check in under their own name instead of the
  buyer's. This does not change who the ticket is for; it only moves who can
  manage it.

## Where this is stated

Deliberately in several places, none of them small print:

| Where                      | Form                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `/tickets`, payment step   | Body-sized text plus a **required** acknowledgment checkbox that gates the pay button |
| `/faqs`, Tickets & Pricing | `faq-refunds` in `src/data/faqs.json`                                                 |
| `/terms`, Refunds          | Summary in the participation terms (ADR 0074), linking back to the FAQ               |
| This file                  | The policy itself                                                                     |

The checkbox is unticked by default and payment cannot proceed without it. It
is not pre-checked, not hidden behind a link, and not written smaller than the
text around it — someone is about to part with money, and a policy they have
to hunt for is a dark pattern.

## The acknowledgment is recorded as evidence — RESOLVED

<!-- Stale before 2026-09-16: this section used to say the acknowledgment
     was a client-side gate only, with no server record. That was true when
     it was written, and stopped being true on 2026-09-02 (ADR 0022) — this
     section just never got updated to say so. Caught while building the
     refund tracker below, PHASE22 §D. -->

Both checkout schemas require `acceptedTerms: true` — a request posted
directly to the API without it is refused with `terms_not_accepted`. Once
accepted, `payment_intents` stores **when** (`terms_accepted_at`, the
server's own clock) and **exactly what wording was shown** (`terms_text`,
re-read server-side from that locale's messages, never taken from the
request body) — a boolean alone proves nothing without both. Tickets and
shop record their own separate wording, because they are different
policies. Full design: `docs/decisions/0022-terms-consent-record.md`,
closing **G9** in `docs/backend/GAPS.md`.

## Tracking a manual refund or exchange request

**Settled 2026-09-16 (PHASE22 §D).** The policies above are unchanged —
tickets stay non-refundable, shop exchanges stay handled manually,
off-platform. What used to have nowhere to live is the REQUEST itself: an
organiser logs one (from *Commerce → Refunds & exchanges* in the
dashboard) when an email comes in, and moves it through
`requested → in progress → resolved` or `denied` as it's handled. This is
a visibility tracker, not a feature that refunds anything — no money moves
through it, and it does not touch a ticket, a badge code, or an order's
own status. See `docs/decisions/0064-refund-exchange-tracker.md`.

## Shop — non-refundable, but exchangeable

**Settled 2026-09-02.** Goods get their own terms:

| Situation                 | What happens                      |
| ------------------------- | --------------------------------- |
| Changed your mind         | **No refund.** Same as tickets.   |
| Arrived damaged or faulty | **Replaced.**                     |
| Wrong item sent           | **Replaced.**                     |
| Apparel, wrong size       | **Exchanged**, while stock lasts. |

The reasoning: a non-refundable rule is ordinary for an event ticket, whose
value is the seat on the day. It is unusual for a physical product, where "the
wrong size arrived" is nothing like "I changed my mind about coming" — and
apparel is most of the catalog.

**Exchanges are handled manually, off-platform**: by getting in touch, or in
person at the next event. Nothing in the product supports an exchange flow, and
none was invented for one — this is a policy someone honours, not a feature.

The shop's acknowledgment copy says exactly this rather than the flat
"non-refundable" tickets use.

## If this changes

Refunds would need real backend work — money movement is manual in the PawaPay
dashboard today (`docs/backend/GAPS.md` G2). Changing the policy is therefore
not a copy edit; it is a feature.
