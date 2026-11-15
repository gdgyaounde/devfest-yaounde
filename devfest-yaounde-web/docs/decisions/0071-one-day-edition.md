# 0071 — DevFest Yaoundé 2026 is one day

Date: 2026-11-15
Status: Accepted — supersedes the **dates** section of ADR 0038 ("The dates
were wrong, not missing"). The rest of 0038 (roster, call configuration)
stands.

## Context

ADR 0038 recorded two Saturdays, 21 and 28 November 2026, and built the date
model around a list of days rather than a base date plus arithmetic. On
2026-11-15 the organisers confirmed the edition is now **one day: Saturday
21 November 2026**.

Upstream had already started the switch (PR #42, "make the single event date
editable in admin"): `EVENT_DATES` became `["2026-11-21"]`, an admin-editable
`site_settings.event_date` (migration 0028) overrides it, and the `faq-when-
where` answer is rebuilt from that date at read time. This ADR finishes the
job and records the decision.

## Decision

- **One date.** `EVENT_DATES = ["2026-11-21"]` in `src/lib/calendar.ts` is the
  repo fallback; `site_settings.event_date` (Admin → Config → Event date)
  overrides it. The live row is `null` today, so the repo date applies.
- **The list shape stays.** Nothing that derives from `EVENT_DATES` was
  rewritten for one day — it already handles any length: `formatEventDates`
  prints "21 November 2026", the hero shows "21 / November 2026", `EVENT.days`
  is 1, `eventHasEnded` closes at 18:00 Yaoundé on the 21st, and the `Event`
  JSON-LD emits a plain start/end with **no `subEvent`** (that branch only
  runs for more than one day). A future multi-day edition is one more entry.
- **No day picker where there is no choice.** `ScheduleBoard` renders no day
  tab bar with one distinct `day`, and `/speakers` drops its day filter. Both
  come back on their own the moment data carries a second day.
- **Copy.** The hero tagline ("Un samedi. / One Saturday."), the English
  schedule meta description and the stale call-for-speakers FAQ (it said the
  call was open until 31 October) were rewritten in both languages; the other
  two-day strings had already been fixed upstream.

## Consequences

- Admin day pickers (speakers, sessions) offer a single "Day 1 — 21 Nov"
  option. That is correct, if a little redundant, and keeps the data model
  unchanged for a multi-day year.
- Any session or speaker saved with `day: 2` would now sit outside the event.
  None exist (the sessions collection is empty; every speaker is day 1).
