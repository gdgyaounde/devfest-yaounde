# Volunteers and the day-of tools

For the organisers who run the event day, and the volunteers who help.

Volunteers get **just what the day needs** — the door, the meal & swag tables,
merch pickup — and nothing else. They never see the dashboard, other people's
emails, payments or refunds, and their access ends by itself after the event.
The reasoning is in ADR 0079.

---

## Before the day: adding volunteers

1. Ask each volunteer to **sign in to the site once** (the account button, with
   Google). They can't be added before that.
2. In **Admin → Users**, find them in **Users who have signed in** and click
   **Make volunteer**. They appear under **Volunteers** with the date their
   access ends: 23:59 (Yaoundé) the day after the event date in settings.
3. Send them the link: `devfest.gdgyaounde.com/fr/volunteer` (or `/en/…`).
   Ask them to open it once and **allow the camera**, and to add it to their
   home screen.

**Remove volunteer** ends access immediately. Every add and remove is in the
audit log. Someone who is already an admin can't also be a volunteer — they
already have every tool.

If the event date changes, **Remove volunteer** and **Make volunteer** again
for each one, so their end date moves with it.

## The three stations

Open `/volunteer` and pick one. Every screen works the same way: big panel,
icon **and** words, phone buzzes. Green means go, yellow means read, red means
stop.

### Door check-in

Scan the QR on the attendee's ticket, type the code, or **find them by name**.
Details in [check-in-and-orders.md](check-in-and-orders.md).

### Meal & swag

At the top, choose what **this table** hands out: **Meal** or **Swag**. The
phone remembers it.

- Scan (or type, or find by name) a ticket. One meal and one bag **per paid
  pass** — a second scan says when it was collected.
- **Swag** shows the T-shirt size and the list of what goes in the bag for that
  pass. If it says "no T-shirt size on file", ask them.
- **Not included** means a free pass, a refunded ticket, or a pass that doesn't
  bundle that perk. Free passes get entry only (see `/terms`).

Two tables can't hand out the same meal: the database marks the ticket the
moment it's scanned, and the second scan is told "already collected".

### Merch pickup

For shop orders bought "pickup at the venue". Search by the buyer's name or the
**order number** they see on their account page (`#4B01C6EB`), check the items
and sizes, then **Mark as handed over**. Shipped orders aren't listed here.

## Where to see the results

- **Admin → Tickets** shows who is checked in.
- Meal and swag collection is recorded on each ticket (`meal_collected_at`,
  `swag_collected_at`) and in the audit log.
- Handed-over orders show as **delivered** in **Admin → Shop orders**.

## When something goes wrong

- **"You're signed out, or your access has ended"** — sign in again with the
  same Google account. After 23:59 the day after the event, that's expected.
- **Offline** — nothing can be checked (on purpose: an offline scan can't know
  whether a badge or a meal was already used). Use the printed ticket list from
  **Admin → Tickets → Export CSV** and settle up afterwards.
- **Anything odd** — don't guess; call an organiser.

## Deploying (developers)

Migration `0032_volunteers.sql` creates the `volunteers` table, the two perk
columns on `tickets`, and the `set_volunteer` / `collect_ticket_perk`
functions. Until it is applied: the door keeps working for admins, volunteers
can't get in (their membership check fails closed), meal & swag and "Make
volunteer" return an error and change nothing.

## The in-app volunteer guide and team list (ADR 0089)

Volunteers no longer need this document: `/volunteer` has a **Start here: the
volunteer guide** tile (`/volunteer/guide`) — a bilingual, phone-friendly page
covering the day hour by hour, each station step by step (door, pay-at-the-venue
reservations, meal & goodies, merch), what to do when something goes wrong, and
how to look after people's data. The copy lives in `messages/{en,fr}.json` under
`staff.guide.sections`; edit it there if the day's plan changes (for example the
station hours).

`/volunteer/team` lists the organisers and the active volunteers by **name and
photo only** (no email or phone), so volunteers can find each other on the day.
