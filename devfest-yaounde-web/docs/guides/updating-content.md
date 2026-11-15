# Updating the content

This is the guide for the things you'll actually change year to year:
speakers, sessions, FAQs and the team.

**The live way:** sign in as an organiser, open `/en/admin` → Content.

1. Publish the names — JSON, or a speakers/team CSV of the basic columns.
   Photos can wait. If the sheet leaves `photoUrl` empty, a picture already
   on that id is kept.
2. Under **Photos still needed**, upload one file per remaining profile.
   Empty, `#` and `/placeholders/…` count as missing.

Until a collection is published the site still reads the files below. After
you publish, editing the file does nothing until you publish again. See
ADR 0031 and 0032.

**The repo way** (still valid as the seed, and for a reviewable diff):
all four live as JSON files under `src/data/`. Copy an existing entry, change
the values, done — then publish from the dashboard if the collection is
already live.

Two rules that apply to every file here:

1. **Both languages, always.** Any field written as `{ "fr": "...", "en": "..." }`
   needs both filled in. A missing language will break the build for that
   page, which is deliberate — it's better than shipping half-translated.
2. **`id` must be unique** within its file, and shouldn't change once
   people might have linked to it (speaker ids appear in shareable URLs).

---

## Adding a speaker — `src/data/speakers.json`

> **2026 lineup (ADR 0073).** The 24 accepted speakers and their 24 sessions
> come from the Sessionize export of 15 Nov 2026. Once migration
> `0030_publish_lineup_2026.sql` is applied they live in the **database** —
> edit them in **Admin → Speakers** and **Admin → Schedule**, not in these
> files, which become the fallback for a fresh clone only.
>
> - **Photos** are committed as `public/speakers/<id>.webp` (converted from
>   Sessionize's 400×400 image). To replace one, upload a new photo in
>   Admin → Speakers.
> - **Icebreakers a speaker left blank** are stored as `"—"`, which the site
>   shows as nothing — no empty quote box. Type a real question and answer in
>   the dashboard to make it appear.
> - **The home page** shows a **daily spotlight**: 6 speakers that change at
>   midnight Yaoundé time, rotating so everyone gets a turn every ~4 days.
>   `featured: true` pins someone to the front of it every day.

```json
{
  "id": "ama-nkeng",
  "name": "Ama Nkeng",
  "role": { "fr": "Ingénieure plateforme", "en": "Platform Engineer" },
  "company": "Some Company",
  "photoUrl": "/speakers/ama-nkeng.jpg",
  "bio": {
    "fr": "Deux ou trois phrases, à la première ou troisième personne.",
    "en": "Two or three sentences, first or third person."
  },
  "track": { "fr": "Cloud", "en": "Cloud" },
  "day": 1,
  "sessionIds": ["s1-keynote"],
  "social": { "x": "https://...", "linkedin": "https://..." },
  "icebreakerQuestion": {
    "fr": "Quelle citation te motive ?",
    "en": "What's a quote that keeps you going?"
  },
  "icebreakerAnswer": {
    "fr": "Une phrase courte, dans leurs mots.",
    "en": "One short line, in their own words."
  },
  "funnyMoment": {
    "fr": "Optionnel — une anecdote courte et sympa.",
    "en": "Optional — one short, shareable story."
  },
  "featured": true
}
```

- **`icebreakerQuestion` / `icebreakerAnswer`** are the personality beat — they
  show up as a pull-quote in the detail reveal, not as a table row. Ask
  something a human would actually ask ("what's a quote that keeps you
  going?"), and keep the answer to one line. This is the field most likely to
  make someone smile, so it's worth getting real answers rather than filler.
- **`funnyMoment`** is **optional**. Leave the whole field out if there isn't
  one — an empty string will render an empty box. It appears as a "true story"
  aside.

- **`photoUrl`** — put the image in `public/` (e.g. `public/speakers/`) and
  reference it from there. Roughly square works best; the card crops to 4:5.
- **`track`** and **`day`** drive the filters on `/speakers`. Reuse an
  existing track name exactly, or you'll create a new filter chip.
- **`social`** — include only the networks they actually have. Leave the
  others out entirely; empty strings will render a dead icon.
- **`featured: true`** pins them to the front of the home page's daily
  spotlight (6 slots; the rest rotate). Keep it to one or two, or the
  rotation has no room left. Everyone appears on `/speakers` regardless.
- **`sessionIds`** links them to sessions (below). It's what makes their name
  appear on a session card. Safe to leave as `[]` until the programme exists.

---

## Adding a session — `src/data/sessions.json`

### Sessions without a time yet (ADR 0073)

`time`, `durationMin` and `room` are **optional**. A session without a
`time` is _accepted but not scheduled_: `/schedule` (and the home preview)
list it under **"The programme — time slots coming soon"**, grouped
workshops first, then lightning talks. Nothing is ever given an invented time.

**To add the times later** (Admin → Schedule, one session at a time):

1. Open the session and fill in **Starts** (and **Duration**).
2. Fill in **Room** in both languages once rooms are known.
3. Save. The session moves from the "coming soon" list onto the timeline;
   once it has both a start and a duration it also gets add-to-calendar
   links. Clearing **Starts** moves it back.

Two sessions with the same start time and different rooms show as a
parallel slot, as before.

**Other session fields**, all optional and all editable in the dashboard:

- `lightning: true` — shown as "⚡ Lightning talk" and grouped with them.
- `online: true` — shows an "Online" marker (Hubert Nang's talk, 2026).
- `level` — `introductory` · `intermediate` · `advanced` · `expert`.
- `language` — `["fr"]`, `["en"]` or `["fr", "en"]`: what it is _given in_.
- `originalLanguage` — the language the speaker _wrote_ the title and
  description in. These are not machine-translated (both sides carry the
  same text); the card says "original text in English" on the French page.

### Re-importing from Sessionize

Don't re-import the whole export over the live data: the dashboard holds
edits (times, rooms, photos) the export doesn't, and the CSV importer caps
bios at 600 characters, which cuts several 2026 bios. For a change to one
speaker or session, edit it in the dashboard. For a whole new lineup (next
year), a developer converts the export the way ADR 0073 describes — public
columns only, never phone/email/residence/T-shirt size — and ships it as a
guarded migration like `0030`.

```json
{
  "id": "s1-cloud-talk",
  "time": "14:00",
  "durationMin": 40,
  "day": 1,
  "kind": "talk",
  "title": { "fr": "...", "en": "..." },
  "description": { "fr": "...", "en": "..." },
  "track": { "fr": "Cloud", "en": "Cloud" },
  "room": { "fr": "Salle B", "en": "Room B" },
  "tags": [{ "fr": "Intermédiaire", "en": "Intermediate" }],
  "bring": { "fr": "Ton laptop.", "en": "Your laptop." },
  "provided": { "fr": "On fournit le wifi.", "en": "We provide wifi." },
  "speakerIds": ["ama-nkeng"]
}
```

- **`kind`** must be one of `talk`, `workshop`, `panel`, `break`. It picks the
  icon and label on the card.
- **`time`** is 24-hour `"HH:mm"`. Sessions sort by it automatically, so you
  don't need to keep the file in order.
- **`bring`** and **`provided`** are optional — omit them entirely for
  sessions where they don't apply (most talks). They only render when present.
- **`speakerIds`** must match ids in `speakers.json`. A typo just means the
  speaker silently doesn't appear, so double-check them.
- Sessions show up on both the home page preview and `/schedule` — there's
  only one list.

### Turning on "add to calendar"

The add-to-calendar buttons are **deliberately hidden** right now, because the
event date isn't confirmed and we won't export a calendar entry on a made-up
day. To switch them on, open `src/lib/calendar.ts` and set:

```ts
export const EVENT_BASE_DATE: string | null = "2026-11-14"; // day 1, YYYY-MM-DD
```

Day 2 is worked out automatically as the following day. The buttons appear on
`/schedule` as soon as that's set.

---

## Adding an FAQ — `src/data/faqs.json`

```json
{
  "id": "faq-parking",
  "category": "venue",
  "question": { "fr": "...", "en": "..." },
  "answer": { "fr": "...", "en": "..." }
}
```

- **`category`** must be one of: `general`, `tickets`, `venue`, `shop`,
  `code-of-conduct` (which is labelled **Participation Terms** on the page —
  the id stayed so existing records keep working, ADR 0040). Anything else
  won't display — the page only renders the
  five known categories, in that order.
- Categories with no questions are hidden automatically, so you can't end up
  with an empty heading.
- Keep answers short and conversational. The search box matches both the
  question and the answer text.
- **"Email us" buttons write the message for the visitor.** An answer can carry
  a `cta` (`{ "label": {…}, "href": "mailto:gdgyaounde@gmail.com" }`). A bare
  `mailto:` there is opened with a subject and a friendly opening already
  filled in, in the visitor's language — a `general` answer gets a plain
  "hello", any other names its own question in the subject so whoever answers
  knows which FAQ fell short. **A `mailto:` that already has its own
  `?subject=…` is left exactly as you wrote it.** The wording lives in
  `messages/*.json` under `mail`, and every email link on the site (footer,
  claim page, community-wall pages, the receipt emails) is built the same way
  through `src/lib/mailto.ts` — a test fails if a bare `mailto:` is added to
  the code.

---

## Adding a team member — `src/data/team.json`

```json
{
  "id": "organizer-7",
  "name": "Real Name",
  "role": { "fr": "Logistique", "en": "Logistics" },
  "oneLiner": {
    "fr": "Une phrase avec de la personnalité, pas une bio formelle.",
    "en": "One line with personality, not a formal bio."
  },
  "photoUrl": "/team/real-name.jpg",
  "social": { "linkedin": "https://..." },
  "contribution": { "fr": "Logistique", "en": "Logistics" },
  "expertise": [
    { "fr": "Front-end", "en": "Frontend" },
    { "fr": "Communauté", "en": "Community" }
  ],
  "gdgSince": 2022,
  "icebreakerQuestion": { "fr": "...", "en": "..." },
  "icebreakerAnswer": { "fr": "...", "en": "..." },
  "funnyMoment": { "fr": "...", "en": "..." }
}
```

- **`contribution`** is what the team page **groups and filters by** — reuse an
  existing value exactly (Organising, Design, Logistics, Sponsoring, Ushering,
  Programme), or you'll create a new one-person group. A new value is fine when
  it's genuinely a new kind of contribution; it appears as a group and a filter
  chip with no code change.
- **Icebreaker and funny moment** work exactly as they do for speakers (above),
  and render through the same component.

- **`oneLiner`** is the point of this page — "keeps the Wi-Fi (and the vibes)
  running" beats "responsible for infrastructure operations". In the admin it
  is labelled **Tagline**: one line on what they do beyond GDG (day job,
  studies, something personal). It shows on the card itself and in the detail.
- **`expertise`** (admin: *Expertise tags*) is up to **3** short bilingual chips
  — "Frontend", "Community", "Design". They show in the detail (popover, sheet
  and slider) and on alumni cards, not on the grid card face, which stays a
  portrait first. Fill one language in the admin and the other is copied.
- **`gdgSince`** (admin: *With GDG since*) is the four-digit year they joined,
  shown quietly under their role as "With GDG since 2022". All three are
  optional — nothing is invented for someone who hasn't supplied them, and a
  CSV re-import keeps whatever is already saved.
- To move someone to the **past organizers** section, add
  `"alumni": true` and `"years": "2024"`. They keep their entry; it just moves
  down the page. Nobody gets deleted — that's the multi-year community story.

### How the team page is organised

Organizers are grouped **by contribution**, not by a sub-team org chart —
because the real reporting structure was never confirmed, and inventing one
would have been worse than not having it. See
`docs/decisions/0010-team-grouping.md`.

This means you control the grouping purely by what you put in
`contribution`. If a real sub-team structure is confirmed later, the page can
be regrouped — it's driven by one field, so it's a small change.

---

## Sponsors and Memory Lane — from the dashboard (ADR 0060)

- **Sponsors** — *Content → Sponsors*. Name, logo, website, tier, and an
  optional blurb. The tier list is Haikyu, Sonnet, Opus, Fable, Mythos
  (ascending, same names as the ticket tiers), plus Community and Partner
  for non-monetary listings.
  - The **blurb** shows in the popup that follows the cursor over their logo
    on a computer, and inline under the logo on a phone. Leave it empty and
    the popup just shows the name.
  - **Transparent logos now stay transparent.** If a sponsor's logo was
    uploaded before this fix and still shows a black box behind it (Google's
    did — that was the actual bug), re-upload it and the black box is gone.
  - Every logo gets a small coloured corner sticker showing its tier — a
    distinct mark per tier (a seed, a note, a star, a book, a flame, a
    node cluster, two linked rings), never reused as decoration anywhere
    else on the site.
- **Memory Lane** — *Content → Memory Lane*. Photo, alt text (both
  languages), an optional year. Order here is the order the grid on the home
  page shows them in. Four or five portrait photos is the sweet spot — this
  is a taste of past editions, not the full album (that's the gallery link
  above). With nothing uploaded, the home page shows a row of dashed empty
  frames — the same open-slot language as the sponsor strip's empty seats —
  instead of an empty grid or invented photos.

## Testimonials and the gallery link — from the dashboard

Both live in the admin now, not in files.

- **Testimonials** — *Community → Testimonials*. Quote in both languages, an
  optional name, role/company and photo. The order of the list is the order
  they rotate in on the home page; **Hide** on a row takes one out of the
  rotation without deleting it. Deleting asks you to type the id.
  - **Only publish words somebody actually said, with their permission.** No
    name to put on it? Leave the name empty and the site shows "Community
    member" / "Membre de la communauté". Never invent a name for a quote.
  - Hide every testimonial and the whole section disappears from the home
    page rather than showing an empty heading.
- **Gallery links** — *Settings → Info bar & policies → Gallery links*, two
  fields (ADR 0058):
  - The **past edition's** album URL — shown as "View the {year} gallery" in
    Memory Lane, the year filled in automatically (one back from the current
    edition). Empty hides that button.
  - The **current edition's** album URL — empty until there is one, normally
    after the event. Once the event's dates have passed, this becomes the
    PRIMARY gallery button in Memory Lane, sitting next to the (now
    secondary) past-edition one — AND it takes over the hero's ticket button,
    since nobody needs a ticket to something that already happened. Leave it
    empty and both of those show "Photo album coming soon" instead of a
    broken link; filling it in later is all it takes to switch them live, no
    other change needed.

---

## What's still placeholder

| File                   | What's fake                                                |
| ---------------------- | ---------------------------------------------------------- |
| `speakers.json`        | All 14 entries — invented names, companies and bios        |
| `sessions.json`        | All 8 — invented titles, times, tracks and rooms           |
| `team.json`            | All 8 — every name literally reads "Placeholder Organizer" |
| `public/placeholders/` | Every image is a flat colour block, not a photo            |
| `past-editions.json`   | Empty (`[]`) — the old 4 fake colourful placeholder photos were removed; the home page shows dashed empty frames until real ones are uploaded at Content → Memory Lane |

The images make the biggest visual difference. Swapping in real community
photos will change how the site feels more than any styling change.

**`faqs.json`** and **`quotes.json`** are no longer in this table — both hold
confirmed content (ADR 0061). One nuance worth knowing about `quotes.json`:
its 7 testimonials are attributed by role only (Volunteer, Organiser,
Sponsor, Attendee, Speaker), never a name, and they were supplied as text by
whoever is maintaining this repo's content rather than sourced individually
from a named person with their own sign-off. That's not the same as an
invented quote — nobody's name is on it — but it's also not a verified
first-person quote either. If a real, individually-sourced testimonial comes
in later (with a name and consent), say so explicitly rather than letting it
blend in.
