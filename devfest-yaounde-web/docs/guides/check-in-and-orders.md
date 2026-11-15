# Check-in and order management

For the people running the door and the merch table. Two endpoints, one
permission, no interface yet — the screens come later, this is what they will
call.

---

## Who is allowed

Both actions require being an **organiser**, which is a row in the `organisers`
table. Being signed in is not enough: these read and write other people's data.

To add someone (Supabase dashboard → Table editor → `organisers`):

| Column    | Value                                                                   |
| --------- | ----------------------------------------------------------------------- |
| `user_id` | Their id from **Authentication → Users**. They must sign in once first. |
| `note`    | Optional — "door team", "merch", so you know who is who later.          |

Removing the row removes the access immediately. There is nothing to redeploy,
which is the point: you can add a volunteer on the morning of the event.

---

## Check-in — `POST /api/check-in`

```json
{ "badgeCode": "DFY-A3K9M-P7QRS" }
```

Three answers, and **all three are normal**:

| `status`             | Meaning                                | HTTP |
| -------------------- | -------------------------------------- | ---- |
| `checked_in`         | First entry. Let them in.              | 200  |
| `already_checked_in` | Used before — `checkedInAt` says when. | 200  |
| `not_found`          | No such code.                          | 404  |

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

- **No interface.** These are endpoints; the scanning screen and the back
  office are not built.
- **No offline mode.** The scanner needs a connection. If the venue Wi-Fi is
  unreliable, that is worth planning for before the day.
- **No refunds.** Cancelling an order does not move money. Refunding a Mobile
  Money payment is manual, through the PawaPay dashboard.
