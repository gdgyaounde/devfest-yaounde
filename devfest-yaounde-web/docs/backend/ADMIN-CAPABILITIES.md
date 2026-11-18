# Admin dashboard — what the backend actually supports

Written before any dashboard code, by reading the backend rather than trusting
the summary. G5 said "organiser back-office backend ready"; this is what that
turns out to mean, feature by feature.

**The headline: access control is real, and the content store is now Postgres
(ADR 0031), with the JSON files as seed and fallback.**

---

## 1. Access control — REAL, and server-side

`currentOrganiser()` in `src/lib/security/organisers.ts` is a genuine
server-side check, and it is already what guards check-in, order status and
the DP review queue.

```
currentUser()                  → the Supabase session's user, server-side
  ↓
select from `organisers` where user_id = …   (through the SERVICE ROLE)
  ↓
OrganiserContext | null
```

Three properties that matter, and all three are already right:

- **It runs on the server.** There is no client-side `isAdmin` to flip.
- **It fails closed.** A database error returns `null` rather than assuming
  membership — the comment in the file says so explicitly.
- **The lookup deliberately uses the service role**, because `organisers` is
  only readable by organisers; a non-organiser asking "am I one?" through
  their own session would read an empty table and get the right answer by
  accident rather than by check.

Membership is a hand-added row in the Supabase dashboard (`organisers`:
`user_id`, `added_at`, `note`). Adding a volunteer on the morning of the event
is one row, not a deploy. There is also an `is_organiser(p_user_id)` RPC for
use inside RLS policies.

**Consequence: the dashboard is not blocked.** It can be gated for real, today,
with the same primitive the existing organiser endpoints use. This phase does
not have to ship a dev-only guard, and does not.

Identity comes from Google OAuth via Supabase (`/auth/callback`), which is
already wired for the public account area.

---

## 2. The content store — resolved by ADR 0031

> **Updated 2026-09-03.** The finding below was true when the dashboard
> shipped. `editorial_documents` and `site_settings` are now the writable
> store; JSON files remain the seed until a collection is published.

Two different things live in two different places, and the difference decides
what the dashboard can do.

| Kind                                                                                                                                  | Where it lives                                 | Writable by a running site? |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------- |
| **Commerce & people** — tickets, orders, order items, payment intents, payment events, discount codes, profiles, DP cards, organisers | **Postgres** (Supabase)                        | **Yes**                     |
| **Editorial content** — speakers, sessions, team, sponsors, FAQs, quotes, stats, past editions, products, ticket tiers                | **JSON files in the repo** (`src/data/*.json`) | **No**                      |

A deployed Next.js app cannot write to its own source files. On Vercel the
filesystem is read-only and every instance has its own copy; even on a plain
server it would be overwritten by the next deploy and invisible to other
instances.

**So "edit speakers from the dashboard" is not a UI task. It is an
architecture decision** — move editorial content into Postgres (or a CMS) —
and it belongs to whoever owns the backend, not to this phase. It is written
up as a decision to take, not a thing to invent: **ADR 0029**.

Until then, every editorial entity is **read-only** in the dashboard, and says
so. Nothing offers a save button that would discard what you typed.

---

## 3. Feature map

**Wire for real** means: reads through existing tables behind
`currentOrganiser()`; writes only through endpoints that already exist.

| Feature                                      | Backend                                                            | This phase                                             |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Overview metrics                             | `tickets`, `orders`, `payment_intents`, `dp_cards` in Postgres     | **Wire for real**                                      |
| Paid tickets list                            | `tickets` table                                                    | **Wire for real** (read + CSV export)                  |
| Transactions                                 | `payment_intents` (status, amounts, discount, failure code)        | **Wire for real** (read + export)                      |
| Shop orders                                  | `orders` + `order_items`                                           | **Wire for real** (read + export)                      |
| Order fulfilment                             | `PATCH /api/orders/:id/status` — exists, organiser-guarded         | **Wire for real** (the one real write)                 |
| DP wall queue                                | `GET /api/dp/gallery/pending`, `PATCH /api/dp/gallery/:id` — exist | **Wire for real**                                      |
| Users who signed in                          | `profiles` table                                                   | **Wire for real** (read, PII-restrained)               |
| Promote / remove admins (Users page)         | `organisers` via `set_organiser_role()` (migration 0026), audited  | **Wired** (Phase 23 §E, ADR 0069) — needs 0026 applied |
| Discount codes                               | `discount_codes` + `POST/PATCH /api/admin/discounts`               | **Writable — ADR 0031**                                |
| Speakers / team / sessions / sponsors / FAQs | `editorial_documents` (JSON files until first publish)             | **Writable — ADR 0031**                                |
| Product catalogue                            | same store; checkout reads it                                      | **Writable — ADR 0031**                                |
| Info-bar message                             | `site_settings.announcement`                                       | **Writable — ADR 0031**                                |
| Privacy / CoC URLs                           | `site_settings`                                                    | **Writable — ADR 0031**                                |
| CSV bulk import                              | Validate + preview; publish is JSON                                | **Validate + JSON publish**                            |
| CSV export                                   | Reads that already exist                                           | **Wire for real**                                      |
| Free-pass RSVPs                              | Bevy, off-platform                                                 | **Not shown at all** — see below                       |
| Audit log                                    | No table, no endpoint                                              | **Gap**                                                |

### Discount codes: writable table, no write path

`discount_codes` is a real table and the checkout already validates against
it. But there is **no endpoint to create or edit one**, and adding one means
authoring backend — new route, new authz enforcement point, new validation —
which this phase excludes. So the dashboard lists them and their redemption
counts, and says plainly that changes are made in Supabase for now.

This is the cheapest real gap to close later: one organiser-guarded route with
a Zod schema, and the UI is already there.

### Free passes are not ours to show

The free tier RSVPs on Bevy and never touches this system — no row, no
`payment_intent`, nothing. A "free tickets" table here would be permanently
empty or, worse, invented. Showing Bevy's numbers would need a Bevy API
integration or a manual import, neither of which exists.

So the dashboard **does not show a free-ticket count at all**. It says where
those numbers live instead. (GAPS.md, and `remaining-work.md` §1 item 8.)

### No audit log

Nothing records who changed what. `payment_events` logs payment lifecycle,
not organiser actions, and the two organiser writes that exist (order status,
card moderation) leave a changed row but no actor and no history.

For a back-office where several volunteers can move money-adjacent state, that
is a real gap rather than a nicety. It needs a table and a write on every
privileged action — backend, so: **GAPS.md G22**.

---

## 4. What this phase will NOT do, and why

- **No new API route, table, RLS policy or authz mechanism.** The boundary is
  explicit, and everything below is reachable without one.
- **No write that has nowhere to go.** Where the store is read-only, the UI is
  read-only. There is no disabled-looking save that silently discards.
- **No client-only gate.** Not needed — see §1.
- **No admin route in the sitemap, and `noindex` on all of them.** Not linked
  from the public site either.

## 5. The reads this dashboard adds

Admin pages are server components that query the existing tables **after**
`currentOrganiser()` returns, using the service role — the same pattern the
existing organiser endpoints use. That adds no schema, no route and no new
authz mechanism, and every one of them is a read.

It does mean each page is its own enforcement point. That is the risk the
security pass in the build is about: the gate is asserted per view, and by
requesting each admin path unauthenticated and checking what comes back.

---

## 6. What was verified, and what could not be

**Verified by request, not by reading the code** (`verify-admin`, 12
assertions): the dashboard answers 404 with no session, with a forged Supabase
cookie, and with invented `isAdmin=true` / `role=organiser` cookies; the
refusal carries no dashboard data and does not name the route; the three
organiser endpoints refuse a stranger; admin is absent from the sitemap,
carries `noindex` even on the refusal, and is linked from nowhere public.

One leak was found and closed this way. Next resolves a route's metadata
**before** rendering it, so a `title` on the admin layout was serialised into
the 404's payload as "Admin · DevFest Yaoundé" — telling anyone probing that
the route exists, which is the whole reason it returns 404 rather than 403.
Moving the title to the page fixed the visible `<title>` and left it in the
flight payload; it is now set client-side, which runs only past the gate.

**Not verifiable here:** the signed-in-but-not-an-organiser case needs a real
Supabase session, and this environment has no project. The logic is a single
membership lookup that fails closed, shared with the existing organiser
endpoints — but it has been read, not exercised. **Someone should sign in with
a non-organiser account once and confirm a 404** before this is relied on.

Also untested locally: everything that needs data. With no Supabase project
the dashboard cannot be rendered at all here, so the views have been
type-checked and built but not seen with rows in them.
