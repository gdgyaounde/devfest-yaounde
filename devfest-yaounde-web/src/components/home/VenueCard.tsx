import {
  ArrowSquareOut,
  CalendarBlank,
  MapPinLine,
} from "@phosphor-icons/react/dist/ssr";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { shapeDrift, stampIn, stampStyle } from "@/lib/motion";
import { loadSettings } from "@/lib/content/settings";
import { EVENT, formatEventDates } from "@/lib/event";

/**
 * WHEN and WHERE (ADR 0084) — the section right after the hero. With the
 * event days away this is what visitors need first: the date, and FMSB
 * Yaoundé, Amphi 350, with ONE link — the exact pin on Google Maps.
 *
 * A plain link, no embedded map: nothing third-party loads and the
 * Content-Security-Policy stays as strict as it was. The abbreviation is shown
 * as given (never expanded here) and there is no street address, because none
 * was confirmed. No opening hours either: the 09:00–18:00 in `EVENT` is only
 * used for structured data, not confirmed for display.
 *
 * The compact card, for pages that already sit in a section (the reservation
 * page, the tickets page). The home page uses the livelier `VenueBand` below.
 */
export async function VenueCard() {
  const t = await getTranslations("venue");
  const locale = (await getLocale()) === "en" ? "en" : "fr";
  const settings = await loadSettings();
  const date = formatEventDates(locale, [settings.eventDate]) ?? "";
  const weekday = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    weekday: "long",
    timeZone: "Africa/Douala",
  }).format(new Date(`${settings.eventDate}T12:00:00+01:00`));
  const { latitude, longitude } = EVENT.venueGeo;

  const label =
    "font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65";

  const card = (
    <div
      id="venue"
      className="scroll-mt-32 rounded-lg border-2 border-black02 bg-offwhite p-6 shadow-[0_6px_0_0_var(--color-black02)] sm:p-8"
    >
      <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
        <div className="flex items-start gap-4">
          <CalendarBlank
            size={44}
            weight="duotone"
            aria-hidden
            className="mt-1 shrink-0 text-black02"
          />
          <div>
            <p className={label}>{t("when")}</p>
            <p className="mt-1 font-sans text-heading-m font-bold capitalize text-black02/80">
              {weekday}
            </p>
            <h2 className="font-sans text-display-l font-bold leading-tight text-black02">
              {date}
            </h2>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <MapPinLine
            size={44}
            weight="duotone"
            aria-hidden
            className="mt-1 shrink-0 text-black02"
          />
          <div>
            <p className={label}>{t("where")}</p>
            <h2 className="mt-1 font-sans text-display-l font-bold leading-tight text-black02">
              {EVENT.venue}
            </h2>
            <p className="font-sans text-body-l font-bold text-black02/85">
              {EVENT.venueFull[locale]}
            </p>
            {EVENT.venueRoom && (
              <p className="font-sans text-heading-m font-bold text-black02/85">
                {EVENT.venueRoom}
              </p>
            )}
            <p className="mt-2 text-body-m text-black02/75">
              {EVENT.city}, Cameroun ·{" "}
              <span className="font-mono text-caption">
                {latitude.toFixed(5)}, {longitude.toFixed(5)}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <a
          href={EVENT.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-7 py-3.5 font-sans text-body-l font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none"
        >
          {t("openMaps")}
          <ArrowSquareOut size={18} weight="bold" aria-hidden />
          <span className="sr-only">{t("newTab")}</span>
        </a>
      </div>
    </div>
  );

  return card;
}

/**
 * The home page's WHEN / WHERE band — the section right after the hero
 * (ADR 0084). With the event days away it is the loudest thing below the fold:
 * a full Yellow field, the date as a tilted ticket stub, FMSB set in
 * display-hero type with "Amphi 350" stamped on it, flat shapes drifting
 * behind, one chunky button to the exact pin on Maps.
 *
 * Everything decorative is flat (no gradients) and `aria-hidden`; the shapes
 * and the stamp honour reduced motion through the shared presets.
 */
export async function VenueBand() {
  const t = await getTranslations("venue");
  const locale = (await getLocale()) === "en" ? "en" : "fr";
  const settings = await loadSettings();
  const at = new Date(`${settings.eventDate}T12:00:00+01:00`);
  const intl = locale === "fr" ? "fr-FR" : "en-GB";
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(intl, {
      timeZone: "Africa/Douala",
      ...opts,
    }).format(at);
  const weekday = part({ weekday: "long" });
  const day = part({ day: "numeric" });
  const month = part({ month: "long" });
  const year = part({ year: "numeric" });

  const mono =
    "font-mono text-mono-tag font-bold uppercase tracking-wide text-black02";

  return (
    <SectionContainer
      id="venue"
      background="yellow"
      maxWidth="6xl"
      className="relative scroll-mt-24 overflow-hidden"
    >
      {/* Flat shapes behind everything — big, few, drifting slowly. */}
      <span
        aria-hidden
        className={`${shapeDrift} pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-halftone`}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -left-10 hidden h-44 w-44 rotate-12 rounded-lg border-2 border-black02 bg-black02 sm:block"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-24 right-[8%] hidden h-16 w-16 rounded-full border-2 border-black02 bg-offwhite lg:block"
      />

      <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)] lg:gap-16">
        {/* WHEN — a ticket stub */}
        <Reveal>
          <div className="mx-auto w-full max-w-xs -rotate-3 transition-transform duration-300 ease-bouncy hover:rotate-0 motion-reduce:transform-none lg:mx-0">
            <div className="relative rounded-lg border-2 border-black02 bg-offwhite shadow-[0_8px_0_0_var(--color-black02)]">
              {/* Punched notches, like a real stub. */}
              <span
                aria-hidden
                className="absolute -left-3 top-[58%] h-6 w-6 rounded-full border-2 border-black02 bg-primary"
              />
              <span
                aria-hidden
                className="absolute -right-3 top-[58%] h-6 w-6 rounded-full border-2 border-black02 bg-primary"
              />
              <div className="rounded-t-[calc(var(--radius-lg)-2px)] bg-black02 px-5 py-2.5">
                <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-primary">
                  {weekday}
                </p>
              </div>
              <div className="px-5 pb-6 pt-4 text-center">
                <p className="sr-only">{t("when")}</p>
                <p className="font-sans text-[clamp(6.5rem,16vw,9.5rem)] font-bold leading-[0.8] text-black02">
                  {day}
                </p>
                <p className="mt-3 font-sans text-heading-l font-bold capitalize leading-tight text-black02">
                  {month}
                </p>
                <p className="font-mono text-body-m font-bold text-black02/70">
                  {year}
                </p>
              </div>
              <div className="border-t-2 border-dashed border-black02/40 px-5 py-3 text-center">
                <p className={`${mono} text-black02/70`}>DevFest Yaoundé</p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* WHERE — the venue, loud */}
        <div>
          <Reveal index={1}>
            <p className="inline-flex -rotate-1 items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-4 py-1.5">
              <MapPinLine size={18} weight="fill" aria-hidden />
              <span className={mono}>{t("where")}</span>
            </p>
          </Reveal>
          <Reveal index={2}>
            <h2 className="mt-5 font-sans text-display-hero font-bold leading-[0.85] text-black02">
              {EVENT.venueShort}
            </h2>
            <p className="mt-3 max-w-xl font-sans text-heading-m font-bold leading-snug text-black02/85">
              {EVENT.venueFull[locale]}
            </p>
          </Reveal>
          <Reveal index={3}>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              {EVENT.venueRoom && (
                <span
                  className={`${stampIn} inline-block rounded-lg border-2 border-black02 bg-black02 px-5 py-2 font-sans text-heading-l font-bold leading-none text-primary shadow-[0_5px_0_0_var(--color-offwhite)]`}
                  style={stampStyle(700, -2)}
                >
                  {EVENT.venueRoom}
                </span>
              )}
              <span className="font-sans text-heading-m font-bold text-black02">
                {EVENT.city}, Cameroun
              </span>
            </div>
          </Reveal>
          <Reveal index={4}>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Button tone="black02" href={EVENT.mapUrl} external size="lg">
                <MapPinLine size={22} weight="bold" aria-hidden />
                {t("openMaps")}
                <span className="sr-only">{t("newTab")}</span>
              </Button>
              <span className="font-mono text-caption font-bold text-black02/70">
                {EVENT.venueGeo.latitude.toFixed(5)},{" "}
                {EVENT.venueGeo.longitude.toFixed(5)}
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </SectionContainer>
  );
}
