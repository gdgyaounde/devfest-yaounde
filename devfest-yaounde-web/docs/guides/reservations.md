# Reservations: reserve now, pay cash at the venue

**Timeline (Yaoundé time).** Until **Wed 18 Nov, 12:00**: tickets and shop are
paid online as before. From 12:00: **nothing is paid on the site**; people
**reserve** on `/reserve`. After **Fri 20 Nov, 23:59**: no more reserving —
people come to **FMSB Yaoundé, Amphi 350** and pay cash. Ticket edits (name,
T-shirt size) still close Wed 23:59. Change any instant in **Admin → Config →
Ticket sales & edits** (payments close · edits close · reservations close).

## What visitors see

- A banner, navbar button and pop-up that change with the phase; a **Reserve**
  button instead of _Get tickets_; shop prices without the online fee.
- `/reserve`: pick tickets (with each attendee's name, and size where the tier
  has a T-shirt) and any shop items from their device bag, give a name and a
  phone, tick the cash acknowledgement. They get a reference like `RES-AB3CD9`
  on screen and under **My reservations** in their account, where they can
  cancel until Friday 23:59 (not once cash has been taken). **No email is
  sent.**
- Limits: at most 10 tickets per reservation, 3 live reservations per account.
  Tier caps count paid tickets + live reservations, so nothing oversells.

## For organisers

- **Admin → Commerce → Reservations**: the list (reference, name, **phone**,
  what, total, status), filters, search and **Export CSV**.
- **Admin home → Commerce recap** now has a _Reserved_ column: items to stock
  include reservations (cancelled ones left out).
- Cash is recorded at the door; the dashboard shows what is still to collect.

## For volunteers (door)

**Day-of tools → Door check-in → "Reserved online?"**: type the reference
(`RES-XXXXXX`, case and dashes don't matter) or 3+ letters of the name. The card
shows who, what was reserved and the **cash to collect**. Buttons: **Cash
received & check in** (normal), _Cash received_, _Check in only_. A cancelled
reservation says so — take no cash, call an organiser. Phone and email are never
shown to volunteers. Walk-ins with no reservation simply pay at the table.

## Deploying (developers)

Apply `supabase/migrations/0034_reservations.sql` (before or after the code).
Until then `/reserve` shows "reservations aren't available right now" and
nothing is written. Test with one real account before announcing.
