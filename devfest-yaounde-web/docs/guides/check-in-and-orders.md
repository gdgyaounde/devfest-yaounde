# Check-in and order management

For the people running the door and the merch table. On the day, the door,
the meal & swag tables and merch pickup all run from the **day-of tools**
(`/volunteer`) — which volunteers can use without being admins. See
[volunteers.md](volunteers.md) for adding them and for the meal/swag and merch
stations; this guide covers the door and the order back office.

---

## Who is allowed

- **Volunteers** (ADR 0079) can use the day-of tools only: door check-in, meal
  & swag, merch pickup. Add them from **Admin → Users → Make volunteer**; their
  access ends by itself at 23:59 the day after the event. See
  [volunteers.md](volunteers.md).
- **Admins** (a row in `organisers`) can do all of that, plus the whole
  dashboard. Don't make door helpers admins: an admin can read every ticket,
  payment and refund, and change the site.

Being signed in is not enough for either: these read and write other
people's data. Removing access takes effect immediately; there is nothing to
redeploy.

---

## The door scanner — `/volunteer/check-in` (ADR 0078, 0079)

Open `devfest.gdgyaounde.com/fr/volunteer` on the phone and tap **Accueil /
Door check-in** (admins also have a **Day-of tools** button at the top of the
dashboard menu). Add it to the home screen the day before so it is one tap
away. The old `/admin/check-in` address still works and redirects here.

**The first time**, tap **Start camera** and allow the camera. After that the
camera starts by itself whenever the page opens.

**Scanning:** point the camera at the QR on the attendee's ticket (their
account page or their receipt email). The phone buzzes and a big panel says
what happened:

| Panel                               | What to do                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Checked in** (green)              | Let them in. The panel says the pass and whether it includes the meal and swag. The camera is ready again after two seconds.                                          |
| **Already checked in** (yellow)     | It says when it was first scanned. Someone stepping out and back is normal; if it is clearly a different person, ask for ID and call an organiser. Tap **Scan next**. |
| **Checked in — read this** (yellow) | A refund is on file. _Refunded_ means entry only — no meal, no swag. _Refund request open_ means they get everything, but tell the refunds desk they came.            |
| **No ticket with this code** (red)  | Check the code with them. People who only RSVP'd on Bevy for a free pass have no code here — a free pass does not need one to get in.                                 |
| **That QR isn't a DevFest ticket**  | They showed the wrong QR. Ask them to open the ticket itself.                                                                                                         |

The same badge held in front of the camera is only counted once: after a scan
the camera ignores that badge for a few seconds.

**No code at all?** Use **No code? Find them by name** under the code box:
type at least three letters of the name on the ticket, then **Check in** next
to the right person. Only names and passes are shown — never emails.

**Typing a code:** when the QR will not scan (cracked screen, dead battery,
printed copy), type the code into **Type the code instead**. Lower case,
spaces and missing dashes are fine, and an O typed for a 0 (or an I or L for
a 1) is corrected for you.

**Torch:** on phones that support it, a light button appears on the camera.

**"Recent scans on this phone"** and the counter at the top only cover this
phone, and reset when the page is reloaded. The real record is in the
database — **Admin → Tickets** shows who is checked in.

The screen is in French by default; switch to English with `/en/volunteer`.

### When the Wi-Fi drops

The screen says **You're offline** and nothing can be checked — on purpose:
a scan that cannot reach the server cannot tell whether the badge was already
used, and two phones would both let the same badge in. Before the day:

1. **Admin → Tickets → Export CSV** on the Friday evening, and print it (or
   keep it on a laptop) as the fallback list.
2. If a scan says **Couldn't reach the server**, tap **Retry** once the
   connection is back. If it then says _already checked in moments ago_,
   that was this same scan going through the first time.

---

## Check-in — `POST /api/check-in`

The API the scanner calls. You do not need it directly.

```json
{ "badgeCode": "DFY-A3K9M-P7QRS" }
```

Three answers, and **all three are normal**:

| `status`             | Meaning                                | HTTP |
| -------------------- | -------------------------------------- | ---- |
| `checked_in`         | First entry. Let them in.              | 200  |
| `already_checked_in` | Used before — `checkedInAt` says when. | 200  |
| `not_found`          | No such code.                          | 404  |

Both `checked_in` and `already_checked_in` can carry `refund`: `"refunded"`
(a resolved refund request points at this ticket, its badge code or its
order) or `"pending"` (a request is still open). It never blocks entry — a
free pass gets anyone in, so a refunded ticket is a free pass now — it tells
the volunteer the paid perks are gone. The code is normalised the same way
the scanner does, so `dfy a3k9m p7qrs` is accepted.

`already_checked_in` is deliberately not an error. At a door it is
information: someone stepped out and came back, or two volunteers scanned the
same badge. The response carries the attendee's name and the original
timestamp so the person scanning can decide, rather than seeing a red screen.

Two volunteers scanning the same badge at the same instant cannot both record
a first entry — the database claims the row before marking it.

Badge codes use an alphabet with no `I`, `L`, `O` or `U`, so nothing is
misread off a phone screen. They are always `DFY-XXXXX-XXXXX`.

---

## Order status — `PATCH /api/orders/:id/status`

```json
{
  "status": "ready_for_pickup",
  "fulfilment": { "method": "pickup", "note": "Merch table, day 2" }
}
```

Orders only move forward:

```
processing ──┬─→ ready_for_pickup ──┬─→ delivered
             │                      │
             ├─→ shipped ───────────┘
             │
             └─→ cancelled          (from any of the three above)
```

`delivered` and `cancelled` are final. Undoing one is a real-world event — a
return, a refund — and should be recorded as such, not by quietly flipping a
status back.

| Response                 | Meaning                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `{ changed: true }`      | Done.                                                                     |
| `{ changed: false }`     | It was already in that status. Nothing happened.                          |
| `409 invalid_transition` | That move is not allowed — the arrow does not exist.                      |
| `409 conflict`           | Someone else changed it between your screen loading and your tap. Reload. |

`fulfilment` is free-form on purpose: pickup-versus-shipping is still an open
question (`PAGES.md` §11), so it holds whatever the team actually uses — a
courier reference, a pickup note — instead of a shape guessed in advance.

---

## Holders editing their own tickets (ADR 0075)

Until **Wednesday 18 November, 23:59** (Admin → Config → Ticket sales &
edits → "Edits close"), anyone signed in can open **My tickets** on
`/account` and change, on their own tickets:

- the **attendee's name** (printed on the identifier), and
- the **T-shirt size**, if the tier includes one.

They cannot change the email, the tier, the badge code or anything about
payment. Editing is refused once the ticket has been scanned at the door, and
while a refund request for it is open or granted (matched on the ticket id,
badge code or deposit id you typed in the refund request's "reference").
Every edit is in the audit log as `ticket.self_edit`, with the before and
after values.

After the cutoff the button is gone and holders see "Edits closed — contact
us"; fix anything else by hand.

### Ordering the shirts

**Admin → Tickets → Apparel sizes** counts every ticket on a tier that
includes apparel, per tier and size (a Sonnet "M" and a Mythos "M" are
different garments), plus how many still have no size. **Download the CSV
after the edits cutoff** — sizes can still change until then.

## What is deliberately missing

- **No offline mode.** The scanner needs a connection, by design (see "When
  the Wi-Fi drops" above). The printed export is the fallback.
- **No check-in for Bevy-only RSVPs.** Free passes taken on Bevy never reach
  this database, so there is nothing to scan; a free pass gets in without one.
- **No refunds.** Cancelling an order does not move money. Refunding a Mobile
  Money payment is manual, through the PawaPay dashboard.
