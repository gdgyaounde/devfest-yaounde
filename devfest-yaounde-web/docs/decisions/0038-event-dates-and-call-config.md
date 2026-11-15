# 0038 — Two dates a week apart, and the calls that run up to them

Date: 2026-09-08
Status: Accepted — the **dates** section is superseded by ADR 0071 (2026 is one
day, Saturday 21 November). The roster and call configuration stand.

## Context

Three things arrived together: the organisers confirmed when DevFest Yaoundé
2026 actually happens, handed over the real roster, and asked for the call for
speakers and the sponsor call to be editable without a deploy.

The dates are the reason this is a decision record rather than a commit.

## The dates were wrong, not missing

**DevFest Yaoundé 2026 runs on 21 November and 28 November 2026** — two
Saturdays, a week apart. Confirmed by the organisers on 2026-09-08.

The Bevy listing shows "Nov 21–28", which reads as an eight-day window. The
code had taken the first date as a base and derived the rest by counting:

```ts
EVENT_BASE_DATE = "2026-11-21";
const start = new Date(y, m - 1, d + (session.day - 1)); // day 2 → 22 Nov
```

That is six days early for every day-2 session, and it was not a display bug.
It was in the `.ics` files and Google Calendar links people import, and in the
`endDate` published to crawlers.

**Decision: the days are listed, not counted.**

```ts
export const EVENT_DATES = ["2026-11-21", "2026-11-28"];
```

`EVENT.days` derives from that array's length, so the count and the dates
cannot disagree — previously they could, and the arithmetic reconciling them
was the bug. A third day is one more entry, not a new assumption.

### What this does to the structured data

`startDate: 21 Nov` with `endDate: 28 Nov` alone tells a crawler this is one
continuous eight-day event — the same misreading the code made, published to
Google. The outer range still spans the whole thing, because that is when the
event begins and ends, and each real day is now listed as a `subEvent` so the
shape is recoverable rather than implied. A single-day event emits no
`subEvent` list.

## The roster is real people now

Ten organisers, from the chapter's own listing: names, GDG position (`role`),
what they did for the event (`contribution` — a separate field, since they
differ), socials, and their Bevy profile as `social.website`. Cyprien Tankeu
is marked `alumni`, which is what puts him in the past-organisers section.

**Photographs are deliberately empty.** They could not be pulled from the
listing and are uploaded through the dashboard later (ADR 0032). That made an
empty `photoUrl` a real state rather than an error, and `<img src="">` is the
worst possible response to it: browsers resolve the empty string against the
current page, re-request the whole HTML document, and draw a broken-image icon
over somebody's name. `MorphedImageFrame` now renders initials on the brand's
pastel instead, and swaps to the photograph the moment one is attached.

## Speakers, sessions and sponsors start empty

The event is not live: the call for speakers is open, no schedule is
published, no sponsor has signed. The placeholder companies and invented
speakers are gone, and the read paths handle nothing gracefully — the sponsor
strip hides rather than rendering a labelled, bordered, blank marquee, and the
speaker reel bails rather than computing `(i + n) % 0`.

Both of those are placeholders for designed states, not the end of the work:
the call-for-speakers view and the empty-seat sponsor teaser are Parts 3 and 4
of this phase.

## The calls are configuration

`site_settings` gains three jsonb columns (`0016_event_config.sql`), seeded
with what the chapter published and editable from the dashboard:

| Setting        | Holds                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| `cfs`          | Sessionize URL, open/close instants, and an `auto \| force-on \| force-off` override |
| `sponsor_call` | Prospectus URL, whether the CTA is up, an optional close date                        |
| `legal`        | Participation terms, privacy, terms                                                  |

They are jsonb rather than nine flat columns because each is one cohesive
setting, read and written together — a URL with no window, or a window with no
URL, is not a state the UI has any use for.

`override` exists because "are there speakers?" cannot answer every case: a
lineup announced before it is entered, or a call reopened after somebody was
added. `auto` is the answer nearly always.

Stored settings are merged over the repo defaults **field by field**. A row
written before these columns existed, or by a form that sent only the
announcement, must not blank the rest by omission — and the save path only
writes the keys the caller actually sent, for the same reason.

Times are stored as explicit UTC offsets. WAT (Africa/Douala) is UTC+1 with no
daylight saving, so `01:00 WAT` is written `2026-09-05T01:00:00+01:00` and
survives being read in another zone.

## Partner is a tier, not a collection

PHASE19 lists Partners beside Sponsors. A `Partner` entity would be a
byte-for-byte copy of `Sponsor` — id, name, logo, link — and PAGES.md
describes one "sponsor/partner logo marquee" which the site renders as one
strip. Two schemas, two admin forms and two publish paths for a distinction
that only changes a label is not worth it, so `partner` joins the existing
tier enum.

## Consequences

- The add-to-calendar links and the `Event` block are correct for the first
  time. Four tests pin it, including that day 3 resolves to `null` rather than
  being invented.
- A fresh clone with no database still renders: every new setting falls back
  to `site-config.ts`, which now holds the real URLs rather than `"#"`.
- ~~**The code of conduct link is still `"#"`, on purpose.**~~ **Answered
  2026-09-08: there is no separate code of conduct — the chapter runs under
  GDG's participation terms, and the site links those. `CODE_OF_CONDUCT_URL`
  is gone. See ADR 0040.**
- `database.types.ts` was hand-extended for the three new columns. It is a
  generated file; regenerate it from the live schema when convenient.
