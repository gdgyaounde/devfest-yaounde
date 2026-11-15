# 0079 — A volunteer role, and the day-of tools it unlocks

Date: 2026-11-15
Status: Accepted

## Context

The door scanner (ADR 0078) was organiser-only, and "organiser" means a row in
`organisers`. That row is far more than check-in rights: `is_organiser()` backs
the RLS read policies on tickets, payment intents, payment events, the
editorial store, the DP wall and the refund tracker, and an organiser gets the
whole dashboard, including making other admins. Ushers and table helpers on
the day need none of that.

They do need three things on Saturday: check people in (including someone who
has no code with them), hand out the meal and swag that paid passes include
exactly once each, and hand over shop orders bought for pickup.

## Decision

1. **A separate `volunteers` table** (migration 0032): `user_id`, `added_by`,
   `added_at`, `expires_at` (required). RLS on with **no policies**, so no
   session can read it and a volunteer gets no database read grants at all.
   Everything goes through server routes.

2. **Access expires by itself**: 23:59 Yaoundé on the day after the settings
   event date, computed on the server (`volunteerExpiry`), never sent by the
   client. `currentStaff()` treats an expired row as no access.

3. **Managed from Admin → Users** through `set_volunteer()`: organisers only,
   re-checked inside the same advisory lock as admin changes, audited in the
   same transaction. No typed-email confirmation (unlike admin changes): the
   role is narrow, time-boxed and one click to undo. Admins cannot also be
   volunteers.

4. **`currentStaff()`** (organiser OR active volunteer) gates only the day-of
   routes: `POST /api/check-in`, `GET /api/staff/tickets`,
   `POST /api/staff/perks`, `GET /api/staff/orders`,
   `POST /api/staff/orders/:id/handover`. Everything else stays behind
   `currentOrganiser()`. Both fail closed.

5. **The tools live at `/{locale}/volunteer`**, bilingual (French first),
   unlike the English-only dashboard: volunteers are not the core team. The
   door scanner moved there; `/admin/check-in` redirects. The camera
   permission header (`camera=(self)`) now covers `/volunteer/*` only.

6. **Name search is deliberately narrow**: three letters minimum, eight
   results, name + pass + the day's ticks only (never email or badge code),
   pattern characters stripped, a tight per-user rate limit, and an audit row
   per search recording its length, not its text. Acting on a result sends the
   ticket id; the server resolves the badge code.

7. **Perks are tracked per ticket** (`meal_collected_at`, `swag_collected_at`)
   and marked by `collect_ticket_perk()` under `FOR UPDATE`, so two tables
   cannot hand out the same meal. Eligibility is decided in the route from the
   tier (free pass → nothing; resolved refund → nothing; meal → every paid
   pass; swag → a paid pass bundling items or apparel). Unlike the door, the
   refund lookup fails CLOSED here: a meal handed out cannot be taken back.

8. **Merch hand-over** covers pickup orders only, through the lifecycle's own
   transitions (`processing → ready_for_pickup → delivered`), each conditional
   on the status it read. Buyers now see a short order number (`#4B01C6EB`) on
   their account page to search by. Shipping and cancelling stay
   organiser-only.

## Consequences

- Door helpers no longer need admin access; making them admins is now the
  wrong answer, and the guides say so.
- The door lookup avoids the new columns, so the door keeps working if the
  code ships before migration 0032. Volunteers, perks and "Make volunteer"
  need the migration.
- Free passes taken on Bevy still have no ticket here: they can't be scanned
  or searched, and need neither to enter.
- The station screens share one camera hook (`use-qr-scanner`) and one kit of
  panels; a future station (e.g. workshop rooms) is a new page plus a route.
- Volunteers' access is tied to the event date setting: moving the date means
  re-adding them to move their expiry.
