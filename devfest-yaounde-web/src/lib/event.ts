import { EVENT_DATES } from "./calendar";
import { SITE_URL } from "./site-config";

/**
 * The event's own facts, in one place.
 *
 * Structured data, metadata and the calendar links all read from here, so
 * there is one thing to edit when the date and the venue are finally
 * confirmed — and nothing that can disagree with the calendar buttons about
 * when DevFest actually is.
 *
 * The default date is 21 November 2026. Public consumers pass the admin
 * date explicitly; `EVENT_DATES` in `calendar.ts` is the repository fallback.
 *
 * WHAT IS STILL UNCONFIRMED: the venue. `docs/setup/remaining-work.md` §1
 * tracks it; filled in, it turns the `Place` below from a city into an
 * address.
 */
export const EVENT = {
  name: "DevFest Yaoundé",
  organizer: "GDG Yaoundé",
  /**
   * The edition. Taken from the chapter's own event slug in `site-config.ts`
   * ("…devfest-yaounde-2026…"), which is the only confirmed statement of the
   * year in the repo — not a guess, but worth re-checking against the real
   * listing before launch.
   */
  year: 2026,
  /**
   * How many days the event runs. Derived from `EVENT_DATES` rather than
   * stated separately, so the count and the dates cannot disagree — they
   * previously could, and the arithmetic that reconciled them was wrong.
   */
  get days() {
    return EVENT_DATES.length;
  },
  /** Local start/end times, used only when a real date exists. */
  startTime: "09:00",
  endTime: "18:00",
  city: "Yaoundé",
  region: "Centre",
  country: "CM",
  /** No venue has been announced. Filled in, this appears in rich results. */
  venue: null as string | null,
  venueStreet: null as string | null,
} as const;

/**
 * The edition MemoryLane's "past gallery" link shows.
 *
 * One year back from the confirmed edition — the album from the LAST time
 * this ran, which is what a "view the gallery" link from an in-progress or
 * upcoming edition's page always means. If an edition is ever skipped, this
 * stays wrong until someone notices and hardcodes the real year here; that
 * is a one-line fix, and simpler than a second admin field asking an
 * organiser to state a number the calendar already implies in every normal
 * year.
 */
export const PAST_GALLERY_YEAR = EVENT.year - 1;

/**
 * ISO start/end for the whole event, or null while the date is unconfirmed.
 *
 * `baseDate` defaults to the real flag and is only ever passed explicitly by
 * the tests — the branch that matters most is the one that cannot be reached
 * today, so it has to be reachable somehow.
 */
export function eventDates(
  dates: readonly string[] = EVENT_DATES,
): { start: string; end: string } | null {
  if (dates.length === 0) return null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  return {
    start: `${first}T${EVENT.startTime}:00`,
    end: `${last}T${EVENT.endTime}:00`,
  };
}

/**
 * Cameroon runs West Africa Time year-round — UTC+1, no daylight saving —
 * so a fixed offset is always correct, unlike almost anywhere else this
 * trick would be tried.
 *
 * WHY THIS IS NEEDED AT ALL. `eventDates()` returns `end` as
 * `"2026-11-28T18:00:00"` — no timezone suffix, which is exactly right for
 * embedding in `Event` JSON-LD (schema.org reads an offset-less date-time as
 * the VENUE's local time, which is the intent there). But `Date.parse()` on
 * that same offset-less string does something different: per spec, it is
 * read as local time OF THE RUNNING PROCESS — the server's OS timezone, not
 * Yaoundé's. On a UTC server that is an hour off from the real 18:00 closing
 * in Yaoundé. Caught by a test asserting the exact closing second, not
 * reasoned out — `eventHasEnded` still read `false` a full hour after the
 * event had actually ended.
 */
const YAOUNDE_UTC_OFFSET = "+01:00";

/** The event's real closing instant, as true UTC milliseconds — or null. */
function eventEndInstant(dates: readonly string[]): number | null {
  const range = eventDates(dates);
  if (!range) return null;
  return Date.parse(`${range.end}${YAOUNDE_UTC_OFFSET}`);
}

/**
 * Whether the whole event — every day of it — is over.
 *
 * Pure, `now` an argument: the same convention as `sponsorCallOpen` and
 * `cfsView`, so this is testable without waiting for November and the public
 * pages, the admin preview and the tests all reach the same answer because
 * they all call this rather than each checking `Date.now()` themselves.
 *
 * `false` while the dates are unconfirmed — nothing can have "ended" that
 * was never scheduled, and that must never be read as "always show the
 * post-event state".
 */
export function eventHasEnded(
  now: Date = new Date(),
  dates: readonly string[] = EVENT_DATES,
): boolean {
  const end = eventEndInstant(dates);
  if (end === null) return false;
  return now.getTime() >= end;
}

/**
 * The window, right after the event ends, during which the cron sweep
 * should force the home page to rebuild.
 *
 * WHY THIS EXISTS. Every public page is statically prerendered and only
 * regenerated on an explicit `revalidatePath` call (see
 * `src/lib/content/revalidate.ts`) — never on a timer. `eventHasEnded()`
 * flipping from false to true is real state changing with nobody around to
 * save anything and trigger that call, so without this the hero would keep
 * selling tickets to a event that already happened until the next unrelated
 * admin edit happened to revalidate `/`.
 *
 * ONE DAY is deliberately generous: this is a one-way switch — once it has
 * flipped there is nothing left to catch — so the cost of checking a few
 * hundred times more than strictly needed is nothing next to the cost of
 * missing the one moment that matters. It comfortably covers the Supabase
 * pg_cron five-minute sweep having a bad day, leaving the once-a-day Vercel
 * Cron backstop (ADR 0028) at least one attempt inside the window.
 */
const POST_EVENT_REVALIDATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function withinPostEventRevalidateWindow(
  now: Date = new Date(),
  dates: readonly string[] = EVENT_DATES,
): boolean {
  const end = eventEndInstant(dates);
  if (end === null) return false;
  const elapsed = now.getTime() - end;
  return elapsed >= 0 && elapsed < POST_EVENT_REVALIDATE_WINDOW_MS;
}

/** Each event day as its own start/end pair, in order. */
export function eventDayRanges(
  dates: readonly string[] = EVENT_DATES,
): { start: string; end: string }[] {
  return dates.map((date) => ({
    start: `${date}T${EVENT.startTime}:00`,
    end: `${date}T${EVENT.endTime}:00`,
  }));
}

/**
 * `Organization` for GDG Yaoundé. Always emitted — none of it is speculative.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: EVENT.organizer,
    url: SITE_URL,
    logo: `${SITE_URL}/logo/d-logo-left.png`,
    address: {
      "@type": "PostalAddress",
      addressLocality: EVENT.city,
      addressRegion: EVENT.region,
      addressCountry: EVENT.country,
    },
  };
}

/**
 * `Event`, or null while the date is unknown.
 *
 * Returning null is the point. `startDate` is REQUIRED by schema.org, so an
 * Event block without one is invalid structured data — Search Console reports
 * it as an error and no rich result appears either way. Inventing a date to
 * satisfy the validator would be worse still: it would publish a wrong date
 * to every crawler that reads it.
 *
 * So this stays silent, and turns itself on the moment `EVENT_DATES` has an
 * entry in `calendar.ts` — the same switch that reveals the add-to-calendar
 * buttons. One edit, both features.
 *
 * **`subEvent` is why this is not just a start and an end.** The two days are
 * a week apart, so `startDate: 21 Nov` with `endDate: 28 Nov` on its own
 * tells a crawler this is one continuous eight-day event, which is wrong in
 * exactly the way a rich result would show: "Nov 21 – 28". The outer range
 * still spans the whole thing, because that IS when the event begins and
 * ends, and each real day is listed as a `subEvent` so the shape is
 * recoverable rather than implied.
 */
export function eventJsonLd(
  locale: "fr" | "en",
  description: string,
  dates: readonly string[] = EVENT_DATES,
) {
  const range = eventDates(dates);
  if (!range) return null;
  const days = eventDayRanges(dates);

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: EVENT.name,
    description,
    startDate: range.start,
    endDate: range.end,
    ...(days.length > 1
      ? {
          subEvent: days.map((day, i) => ({
            "@type": "Event",
            name: `${EVENT.name} — ${locale === "fr" ? "Jour" : "Day"} ${i + 1}`,
            startDate: day.start,
            endDate: day.end,
          })),
        }
      : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: `${SITE_URL}/${locale}`,
    image: [`${SITE_URL}/og?title=${encodeURIComponent(EVENT.name)}`],
    location: {
      "@type": "Place",
      name: EVENT.venue ?? EVENT.city,
      address: {
        "@type": "PostalAddress",
        ...(EVENT.venueStreet ? { streetAddress: EVENT.venueStreet } : {}),
        addressLocality: EVENT.city,
        addressRegion: EVENT.region,
        addressCountry: EVENT.country,
      },
    },
    organizer: {
      "@type": "Organization",
      name: EVENT.organizer,
      url: SITE_URL,
    },
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/${locale}/tickets`,
      priceCurrency: "XAF",
      availability: "https://schema.org/InStock",
    },
  };
}

/**
 * The dates as a person reads them: "21 & 28 November 2026".
 *
 * WHY THIS EXISTS. The hero and the ticket confirmation email both carried
 * the string "21–22 November 2026" — hand-typed, from the Bevy listing's
 * "Nov 21–28", and wrong in both the way ADR 0038 fixed everywhere else. One
 * of them is sent to somebody who has paid.
 *
 * A dash is the thing to avoid. It means "through", and these two Saturdays
 * are a week apart, so "21–28" tells a reader the event runs for eight days.
 * An ampersand says exactly what is true: two days, both of them listed.
 *
 * Returns null when there are no dates — the same silence as `eventDates`,
 * so a surface without a date shows nothing rather than a stray year.
 */
export function formatEventDates(
  locale: "fr" | "en",
  dates: readonly string[] = EVENT_DATES,
): string | null {
  if (dates.length === 0) return null;

  const parsed = dates.map((d) => {
    const [y, m, day] = d.split("-").map(Number);
    // Midday UTC, not midnight: a date at 00:00 in one timezone is the
    // previous day in another, and this string is read in Yaoundé.
    return { y, m, day, at: new Date(Date.UTC(y, m - 1, day, 12)) };
  });

  const tag = locale === "fr" ? "fr-FR" : "en-GB";
  const monthOf = (at: Date) =>
    new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" }).format(at);

  const sameMonth = parsed.every(
    (p) => p.m === parsed[0].m && p.y === parsed[0].y,
  );

  // Days share a month: name it once. "21 & 28 November 2026", not
  // "21 November 2026 & 28 November 2026", which nobody says out loud.
  const parts = sameMonth
    ? parsed.map((p) => String(p.day))
    : parsed.map((p) => `${p.day} ${monthOf(p.at)}`);

  const joined = joinList(parts, locale);
  return sameMonth
    ? `${joined} ${monthOf(parsed[0].at)} ${parsed[0].y}`
    : `${joined} ${parsed[parsed.length - 1].y}`;
}

/** "a & b", "a, b & c" — and in French, "et". */
function joinList(parts: string[], locale: "fr" | "en"): string {
  if (parts.length <= 1) return parts[0] ?? "";
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(", ");
  return `${rest} ${locale === "fr" ? "et" : "&"} ${last}`;
}

/**
 * The dates split into the two halves a stat block wants: a loud value and a
 * quiet caption.
 *
 * "21 & 28" is the numeral you read across the room; "November 2026" is the
 * line under it. `formatEventDates` already produces the whole sentence, and
 * this is the same information cut differently rather than a second place
 * where a date could be typed and get out of step.
 *
 * Null when there are no dates, for the same reason as everything else here:
 * a caption with no value above it is worse than neither.
 */
export function eventDateParts(
  locale: "fr" | "en",
  dates: readonly string[] = EVENT_DATES,
): { value: string; caption: string } | null {
  if (dates.length === 0) return null;

  const parsed = dates.map((d) => {
    const [y, m, day] = d.split("-").map(Number);
    return { y, m, day, at: new Date(Date.UTC(y, m - 1, day, 12)) };
  });

  const last = parsed[parsed.length - 1];
  const sameMonth = parsed.every(
    (p) => p.m === parsed[0].m && p.y === parsed[0].y,
  );

  const month = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(last.at);

  /*
    Days alone as the value only works when they share a month — "21 & 5"
    across a month boundary would be unreadable without the months, so that
    case puts the whole date in the value and the year underneath.
  */
  if (!sameMonth) {
    return {
      value: formatEventDates(locale, dates) ?? "",
      caption: String(last.y),
    };
  }

  const days = parsed.map((p) => String(p.day));
  const joiner = locale === "fr" ? "et" : "&";
  const value =
    days.length === 1
      ? days[0]
      : `${days.slice(0, -1).join(", ")} ${joiner} ${days[days.length - 1]}`;

  return { value, caption: `${month} ${last.y}` };
}
