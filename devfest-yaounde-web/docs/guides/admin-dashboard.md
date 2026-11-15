# Getting into the admin dashboard

**The URL is `/en/admin`** (or `/fr/admin` — the dashboard itself is English
either way). Plain `/admin` redirects to the default locale and lands in the
same place.

**A 404 is the correct and only refusal.** There is no "access denied" screen,
on purpose: a 403 would confirm the route exists to anyone typing URLs. So a
404 means one of exactly three things, and this page is the order to check
them in.

---

## 1. Is Supabase configured at all?

Without it the page cannot even ask who you are. Locally you need a
`.env.local` — copy `.env.example` and fill in at least these three:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon key>"
SUPABASE_SERVICE_ROLE_KEY="<service role key>"
```

Both are in the Supabase dashboard under **Project Settings → API**.

- The **anon** key is public and safe in the browser.
- The **service role** key bypasses RLS entirely. It is server-only, must
  never appear in a `NEXT_PUBLIC_` variable, and must not be committed.

If these are missing the page returns a **500**, not a 404, and the server log
says `NEXT_PUBLIC_SUPABASE_URL is not set`. That is a different problem from
the one this guide is mostly about.

You do not need any other variable for the dashboard. The community wall is
on (ADR 0033). Click a card on the Wall panel to hide or show it — grey and
faded means off, but the file is still there, so this is reversible. The
trash icon in the corner of a card is not: it removes the image and the
record together, the same as a takedown request, and the card does not come
back. The download icon beside it saves a copy — that is deliberately
possible here and deliberately blocked on the public wall, because this side
sits behind a server-checked organiser session. A card with a small flag
badge has been reported by a visitor; that count is the only signal the panel
gives you for which ones to look at first.
The active section lives in `?view=` so a reload keeps your place. **Back to
site** in the sidebar returns to the public homepage.

## 2. Are you signed in?

The dashboard reads a Supabase session cookie. There is no login form on the
admin route — it is not a separate account system.

**Sign in at `/en/account` with Google first**, then go to `/en/admin`. If you
have never signed into the site with the Google account you are about to make
an organiser, do that now: the row in step 3 needs a user id that only exists
once you have signed in at least once.

## 3. Are you in the `organisers` table?

This is the usual answer. Being signed in is not enough — the site has one
account system, and organiser rights are a separate row.

In the Supabase SQL editor:

```sql
-- Who am I? (use the email you signed in with)
select id, email from auth.users where email = 'you@example.com';

-- Make that person an organiser
insert into organisers (user_id, note)
values ('<the id from above>', 'Joel — set up 2026-09-03');

-- Check it took
select o.user_id, u.email, o.added_at, o.note
from organisers o join auth.users u on u.id = o.user_id;
```

Then reload `/en/admin`. No deploy, no restart — the check is a live query, so
adding a volunteer on the morning of the event is one row.

**To remove someone**, delete their row. Access stops on their next request.

### Once you are in, use the Users page instead

The SQL above is how the **first** admin is created — somebody has to be able to
open the dashboard before they can use it. After that, **Users** in the sidebar
promotes and removes admins without the SQL console (Phase 23 §E, ADR 0069):

- **Admins** are listed first, in full, with who you are marked. **Make admin**
  is on every other signed-in user.
- Both directions ask you to **type the person's email address** to confirm,
  after a plain statement of what is being granted (full control of content,
  money and other people's data, including making more admins) or lost
  (immediately, on their next request).
- **The last admin can never be removed** — the button is disabled with an
  explanation, the server refuses it, and so does the database. Make someone
  else an admin first.
- Removing **yourself** needs an extra tick, and is refused by the server
  without it.
- Every promotion, removal **and refused attempt** goes in the audit log
  (`admin_audit`: `organiser.promoted`, `organiser.demoted`,
  `organiser.demote_refused`, `organiser.change_refused`,
  `organiser.rapid_changes`), written in the same database transaction as the
  change.
- **Needs migration 0026 applied first.** Without it the buttons fail closed —
  nothing changes.

One consequence worth knowing: because of the database safeguard, **deleting the
Supabase auth user of the last admin is refused too** (it cascades into
`organisers`). Add the next admin first, then remove the old one.

---

## Why it is a table and not an env var

An allowlist in the environment would mean a redeploy to add a volunteer at
the venue, and it would mean the list lived in two places once you had more
than one environment. A row is checked live, is auditable in the database, and
carries a `note` so a year later you can tell why someone has access.

## What the gate actually does

`currentOrganiser()` in `src/lib/security/organisers.ts`:

1. Resolves the Supabase session **on the server** — a cookie a browser cannot
   forge without the signing secret.
2. Looks up `organisers` **through the service role**, because the table is
   only readable by organisers; asking through your own session would return
   an empty table and give the right answer by accident rather than by check.
3. **Fails closed.** A database error returns "not an organiser", never the
   benefit of the doubt.

The same function guards check-in, order status and the wall's moderation
queue. There is no client-side flag anywhere — nothing to flip in devtools.

## Once you are in

The dashboard is one page with a sidebar; views swap without a page load.
What is real, what is read-only and why is in
[`docs/backend/ADMIN-CAPABILITIES.md`](../backend/ADMIN-CAPABILITIES.md). The
short version:

- **Real:** metrics, tickets, transactions, orders, discount codes (create and
  disable), users, wall status, CSV export, content publish, settings.
- **Writes:** moving a shop order along, publishing a collection as JSON or
  CSV, attaching a photo per remaining profile, saving the announcement and
  legal URLs, creating a discount code.
- **Fallback:** until a collection is published, the public site still reads
  `src/data/*.json`. See ADR 0031.

### Your avatar in the sidebar

The circle above "Back to site" shows your **Google profile picture**, with
your email under it. There is nothing to configure: signing in with Google
already returns the picture (the site requests the standard `openid email
profile` scopes, and `profile` includes it), and no extra permission is asked
for. If the picture is missing, or fails to load, it falls back to the first
letter of your name.

Only an `https` image on Google's own image host is ever shown — the value
sits in account metadata that a signed-in person can edit for themselves, so
anything else is ignored rather than trusted (`src/lib/admin/avatar.ts`).
Change your picture in your Google account; it appears next time you sign in.

### Choosing which navbar tabs show

**Config → Navigation** has a switch for each of **Schedule, Speakers, FAQs,
Team, Shop and Tickets**. The language switch (FR / EN) is always there. A line
under the switches previews what the bar will show; **Save navigation** makes it
live on the next page load (no deploy).

- It removes the tab's **links from the navbar and the footer** (the footer's
  Event links, its Shop link and its Tickets button; with all four Event links
  off, that column disappears). It does not remove the page: the address still
  works, and buttons elsewhere (on the home page, say) that point to it keep
  working.
- **DP generator & Community wall** is a seventh switch that is **footer-only**
  (there is no navbar link for it). It is one switch for two pages on purpose —
  the wall is where the generator's cards end up — so off hides **both** footer
  links and on shows both; there is no way to show one without the other. The
  pages themselves stay reachable (they link to each other), same as any hidden
  tab.
- Saving needs **migration 0027** applied to the database; until then the switch
  will not save (the panel says so) and every tab simply shows.

### Editing content record by record

**Content** in the sidebar is now four editors — Speakers, Schedule, Team,
Sponsors — plus **Bulk & photos** for CSV and JSON imports. Each list has an
add button, a pencil to edit and a bin to delete, and editing opens a panel
over the list rather than a separate page.

A few things worth knowing before you use them:

- **The id is the URL.** It fills itself in from the name for a new record and
  is then left alone — changing it on an existing one breaks any link to it,
  and photos are attached by id.
- **Photos go in the form.** Pick one while adding somebody and it previews
  straight away; saving writes the record and then attaches the picture. If
  the record saves but the upload fails you are told which half failed, so you
  can reopen them and retry rather than wondering (ADR 0043).
- **A save shows on the public site immediately.** The public pages are
  prerendered for speed, so saving also tells Next to rebuild the pages that
  change — reload the public page after a save and it is there. If it is not,
  the save failed; it is not a cache you need to wait out (ADR 0042).
- **Every save writes the whole collection**, because that is how the store
  works (ADR 0031). If somebody else changed the same list while you had the
  panel open, your save is refused with a note asking you to reload — rather
  than quietly overwriting their work.
- **Order matters where it is shown.** Schedule, Team and Sponsors have
  up/down arrows, and each press saves immediately.
- **Team past/current** is the switch on each member. Past organisers move to
  the alumni section on the public page.
- The **day** picker only offers days the event actually has, and shows the
  real date beside each one, so a session cannot be scheduled onto a day that
  does not exist.

### Ticket sales & edits (the Wednesday cutoff)

**Configuration** has a "Ticket sales & edits" block under the event date
(ADR 0072). Two dates, both **Yaoundé time**:

- **Sales close** — from this minute on, checkout refuses tickets (and the
  swag that only comes with a ticket). The tickets page shows "Sales closed",
  the banner's "sales close Wednesday" line goes away, and the hero's ticket
  button becomes "Ticket sales closed". **The shop is never affected.** For
  2026: Wednesday 18 November, 23:59.
- **Edits close** — from this minute on, ticket holders can no longer change
  their ticket's name or T-shirt size from their account. Same default.

Leave a box empty for "no cutoff". The line under each box says whether it is
open or closed right now, computed by the same code checkout runs.

If the boxes fail to save, migration `0029_ticketing_cutoff.sql` has not been
applied yet — until it is, the site uses the Wednesday default anyway.

### The call for speakers

**Configuration** in the sidebar has a call-for-speakers block under the
announcement. It drives three places at once: the section on the home page,
the `/speakers` page and — when nothing has been typed in the announcement
boxes — the banner above the navbar.

- **Show the call** is normally left on _Automatic_: the call shows while the
  speaker list is empty and switches to the lineup the moment you add one.
  _Always_ and _Never_ are for the two weeks where those disagree — a lineup
  announced before it is entered, or a call reopened after the first speaker.
- **Both dates are Yaoundé time**, whichever clock you are reading them on.
  Leave one empty for no bound: an empty close date means the countdown
  disappears and the call runs until you change it.
- **With no submission URL the call never shows**, because there would be
  nothing to click.
- The line under the heading tells you what the public site is doing _right
  now_ — it is computed by the same code the site runs, so it cannot go stale.

A typed announcement always wins over the call. If you write something in the
announcement boxes, that is what the banner says and the submit button goes
away with it.

### The home page background

**Configuration → Home page background** holds the one image behind the whole
landing hero. Pick a file and it uploads straight away — unlike the text boxes
on that screen, there is no Save step, because the bytes have to reach the
server before there is anything to save.

- **One file.** It is resized for phones and desktops automatically; there is
  no second mobile version to upload.
- **Transparency survives.** It is stored as WebP, so a picture with a cut-out
  subject keeps its transparent background and the theme colour shows through
  it — including when somebody switches the site's theme.
- **Nothing uploaded is a finished look**, not a gap. The hero shows the theme
  colour on its own, which is how it ships.
- It sits under a tint, so a busy or bright photograph still leaves the
  headline readable.
- **Reload the home page and it is there.** An earlier version of this
  screen uploaded and saved correctly but never told the live site to rebuild
  its prerendered page, so a genuinely successful upload could still look
  like nothing happened. Fixed (ADR 0048) — if a reload still shows nothing,
  that is a real failure worth reporting, not a cache to wait out.

### Sponsors, and the ask for more

The sponsor **strip on the home page always shows six seats**, filled from the
left by whoever is in Content → Sponsors. Empty ones are dashed outlines, and
that is deliberate: a company reading the site can see there is room. It only
starts scrolling once every seat is taken.

**Configuration → Become a sponsor** controls the ask beside them:

- **Prospectus URL** is what the button opens, in a new tab. Empty hides the
  button — there would be nothing behind it.
- **Closes** is a Yaoundé-time deadline, and empty means none.
- **Show the CTA** takes it down everywhere at once, deadline or not. Use it
  when the deck is out of date or a conversation is mid-flight.

The line under the heading says what the strip is doing right now, counted
from the sponsors you have actually saved.

### Legal links

**Configuration → Legal links** holds the three at the bottom of the footer:
participation terms, privacy policy, terms of service. All three are other
people's pages — GDG's and Google's — because the chapter runs under those and
publishes none of its own.

**There is no code-of-conduct field.** The participation terms are that
document here, and the FAQ's "rules of conduct" answer links the same URL
(ADR 0040).

Blank any of the three and the label stays in the footer but stops being a
link. That is on purpose: people look for those words, and quiet text is
honest where a link that goes nowhere is not.

### Taking somebody off the site without deleting them

Speakers and Team rows have a **Hide** button. Press it and that person stops
appearing anywhere public — the lineup, the home slider, the schedule, the
team page — while the record stays exactly as it was. **Show** puts them back.

Use it for anyone who has withdrawn, is not announced yet, or should come off
the page for a while. Deleting them and typing it all back in later is how
records get lost.

A hidden row is faded in the list, and the **Hidden** filter finds them again.
Bulk CSV re-imports do not un-hide anybody: the flag is carried over, because
the sheet has no column for it.

### Finding a record

Speakers and Team have a search box and a couple of chips above the list —
name, company or role, plus day/featured for speakers and current/past for
team. It narrows **what you see, never what is saved**: a save always writes
the whole list, filtered view or not.

The up/down arrows disappear while a filter is on. They swap a row with its
neighbour, and under a filter the row above on screen is not the row above in
the list — clear the filter to reorder.

### The DP wall

Cards flip immediately when you hide or show one and wear a shimmer until the
change lands. If it fails, the card goes back the way it was and a message
says so — the screen never disagrees with the wall. The filter above the grid
narrows to what is live or what is hidden.

## Still 404 after all three?

- Check you are on the right **project** — a `.env.local` pointing at a
  different Supabase project than the one you added the row to will fail
  silently and look identical.
- Check the row's `user_id` matches `auth.users.id`, not `profiles.id` from a
  different environment.
- Look at the server log. A failed membership lookup is printed as
  `[organisers] membership lookup failed`.
