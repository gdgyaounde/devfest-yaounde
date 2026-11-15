# 0073 — The 2026 lineup: unscheduled sessions, talks on profiles, a daily spotlight

Date: 2026-11-15
Status: Accepted

## Context

Sessionize's "accepted sessions" export (15 Nov 2026) holds the full lineup:
24 speakers, 24 sessions (4 workshops, 20 lightning talks), one given online.
**Rooms and times are empty** — nothing is scheduled yet, six days out. The
site had placeholder data, a `Session` that required a time and a room, and a
home reel that showed `featured` speakers only.

Two facts about the live database (read-only, 2026-11-15) shaped how it
ships: the `speakers` row in `editorial_documents` **exists and is an empty
array** (so it overrides `speakers.json` — the JSON alone would publish
nothing), and there is **no `sessions` row**.

## Decision

### Data

- `speakers.json` / `sessions.json` are generated from the export's **public
  columns only**: names, tagline, bio, icebreaker, LinkedIn / Blog / Company /
  X, profile picture, session fields. Phone, emails, residence, T-shirt size
  and the owner informed/confirmed timestamps were never read into anything
  that is committed or logged. The export stays in gitignored `/.private/`.
- Names fixed where Sessionize split them badly (Steve Kambea Ndjeumou,
  Manuel Karim Abolo, Sandra Macheu Talla, Ange Naomy Kengne Takoumbo, Le
  Prince Dachi, David Njome). Speaker ids are name slugs; session ids are
  `sz-<Sessionize id>`.
- **Bios and roles are bilingual**: the speaker's own text verbatim (obvious
  typos fixed) on their side, a translation on the other. `company` is taken
  from the tagline only when it names an organisation.
- **Session titles and descriptions are NOT translated**, per devfest-i18n:
  both sides carry the speaker's text and `originalLanguage` makes the card
  say "original text in English" on the other locale's page.
- Track = the session's first Sessionize tag ("AI" folded into "AI & ML");
  every tag is kept in `tags[]`. Facebook links are dropped (no schema field);
  a "blog" that was a LinkedIn post was dropped rather than shown as a
  website.
- **Photos** are downloaded once, converted to 400×400 WebP with sharp
  (metadata stripped) and committed as `public/speakers/<id>.webp`, so they
  are served locally and optimised by `next/image` rather than hot-linked
  from cdn.sessionize.com. Paired by export row, and checked by eye.

### Sessions without a slot

`Session.time`, `durationMin` and `room` became optional; new optional fields
`lightning`, `online`, `level`, `language`, `originalLanguage`. A session
without a time is **accepted, not scheduled**: `ScheduleBoard` lists it under
"The programme — time slots coming soon", grouped workshops → lightning
talks → other, never on the timeline. Add-to-calendar needs a start AND a
duration (`hasCalendarSlot`). The room filter only appears once rooms exist.
The dashboard's session editor treats an empty start time as "unscheduled";
filling it in later moves the session onto the timeline.

`SessionMeta` renders format / Online / level / language as icon + text
chips, once, for both the schedule card and the speaker profile.

### Every profile shows its talk

`/speakers` resolves each speaker's `sessionIds` on the server and passes
them as a display-only `talks` field; `PersonDetail` renders title, chips,
tags and description. The home teaser (`personality={false}`) does not.
Blank or `"—"` icebreakers (the import's "not given") now render nothing.

### The daily spotlight

The home reel shows **6** speakers a day: `featured` ones pinned first, the
rest from a seeded permutation that is fixed for a cycle of
`ceil(M / slots)` days and shown one window per day — so with 24 speakers
everyone appears every 4 days. The seed is the date in **Africa/Douala**, the
picks are computed on the server (no hydration question), and the home page
gets `export const revalidate = 3600` so it picks up the new day within an
hour of local midnight without becoming dynamic.

### Publishing and revalidation

Migration **0030** upserts both arrays. It refuses to run if either row
already holds records (no overwriting hand-entered data) and snapshots both
into `editorial_migration_backup` first. Speaker saves now refresh `/`,
`/speakers` **and `/schedule`**; session saves refresh `/schedule`, **`/`
and `/speakers`** — both locales.

## Consequences

- Until 0030 is applied, production keeps showing the call-for-speakers view
  (the empty live row wins) — but `/schedule` already lists the 24 sessions
  from the JSON, with speaker names missing, because sessions has no row.
  Apply 0030 promptly after the deploy.
- The CSV importer caps bios at 600 characters and would truncate several of
  these; it is not the re-import path for this lineup (see the content guide).
- `cfs.override` is `auto` in production, so `/speakers` flips to the lineup
  the moment the row has a visible speaker.
