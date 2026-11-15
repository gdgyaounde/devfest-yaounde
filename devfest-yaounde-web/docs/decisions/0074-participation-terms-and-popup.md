# 0074 — Participation terms on-site, and a versioned "terms updated" pop-up

Date: 2026-11-15
Status: Accepted — refines ADR 0040 (the GDG code of conduct stays external)

## Context

Days before a one-day event (ADR 0071), the site contradicted itself about
what a free pass gets. The live free tier (Haikyu) listed "Lunch and coffee
breaks" and a sticker pack and showed a swag preview; every paid tier said
"Everything in the free pass" — so food was only ever promised through the
free tier. The footer's "Participation terms" pointed at GDG's page, which
covers conduct but nothing about passes.

The organisers' rule: the talks, workshops, stands and community are open to
everyone with a free or paid pass; **food and drinks, swag, event identifiers
(badge, lanyard, bracelet or similar) and every other physical perk are for
paid passes only**, and only for what their tier lists. A free pass gives no
claim to them, including leftovers. The certificate of participation stays a
free-pass perk (organiser's decision, 2026-11-15).

## Decision

### `/[locale]/terms`

An on-site page, French as the reference: what DevFest is; a **free vs paid
table generated from `ticket-tiers`** (the same store `/tickets` reads, so it
cannot drift); the food & swag rule as the page's loudest block; entry and
badges ("badge, lanyard, bracelet or similar" — no specific item named,
because the format is not fixed); ticket changes until `editsCloseAt`;
refunds; photos and the DP wall (`/wall/terms`); GDG's code of conduct (still
external, `GDG_CODE_OF_CONDUCT_URL`, ADR 0040); contact. A version + "last
updated" stamp sits at the top.

`legal.participationTermsUrl` now defaults to `/terms`. `MaybeLink` sends an
internal path through the locale-aware `Link` (same tab, right locale);
privacy and terms of service stay Google's, external.

### Versioned terms

`legal.termsVersion` and `legal.termsUpdatedAt` (repo defaults
`TERMS_VERSION` / `TERMS_UPDATED_AT` = `2026-11-15`), edited in Admin →
Config → Legal links. `legal` is jsonb merged key by key, so no column is
needed. The version is a restricted token because it becomes a storage key.

### The pop-up

`TermsUpdatedPopup`, mounted next to `GlobalChrome`, shows once per browser
per version: a 2–3 line summary, "Got it" and "Read the terms". Built on the
shared `Modal` (dialog variant: focus trap, Escape, `aria-labelledby`, scroll
lock, reduced-motion-safe entrance). `useSeenOnce(key)` remembers it under
`devfest:terms-seen:<version>` in localStorage, falling back to
sessionStorage and then memory — never "every page". It waits for the
preloader to leave the DOM (ADR 0041) and then ~2.6 s for the hero entrance
(0.6 s under reduced motion), so it never takes focus mid-entrance. Never on
`/admin`, `/terms` (visiting it counts as seen) or the full-screen wall.

### The data

- Haikyu: removed lunch/coffee and the sticker pack, removed
  `swagProductIds`, added "Workshops, within each room's capacity"; kept
  talks, stands, certificate. The free card on `/tickets` no longer renders
  a swag preview at all.
- Sonnet, Opus, Fable, Mythos: each now lists "Lunch and coffee breaks" and
  "An event identifier (badge, lanyard, bracelet or similar)" explicitly.
  Lunch is not new for paid buyers — they had it through "Everything in the
  free pass"; it is now stated where it belongs.
- The live `ticket-tiers` row overrides the JSON, so **migration 0031** writes
  the corrected payload, computed from the live row as read on 2026-11-15. It
  refuses to run if the row was saved since (the same edits are then listed
  for doing by hand), and backs the row up first. It also repoints
  `legal.participationTermsUrl` to `/terms`, only if it is still GDG's URL.
- FAQs (no DB row, so the JSON ships live): five rewritten, three added ("Is
  DevFest free?", "Will there be food for free-pass holders?", "Can I change
  my T-shirt size?"); every perk answer's button goes to `/terms`.

### Consent

`pages.tickets.refundAck` — what `src/lib/payments/terms.ts` records into
`payment_intents.terms_text` — gains a clause referencing the participation
terms, and the payment step links them. **This only affects orders placed
from the deploy on**, which is intended: past orders keep the wording their
buyers actually accepted.

## Consequences

- Bumping the version is the one lever to re-inform everyone; it costs one
  dialog per browser. Do it only when the terms really change.
- The T-shirt FAQ describes self-service edits that Part C builds; deploy C
  before Wednesday or that answer promises a feature that is not there yet.
- An FAQ has one button; for "Can I buy merch without a ticket?" it now goes
  to `/terms` rather than the shop, because it explains the perk boundary.
