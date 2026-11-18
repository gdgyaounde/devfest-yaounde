import { ArrowSquareOut, MapPinLine } from "@phosphor-icons/react/dist/ssr";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/ui/Reveal";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { EVENT } from "@/lib/event";

const MAP_BUTTON =
  "inline-flex items-center gap-2 rounded-pill border-2 border-black02 px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none";

/**
 * Where DevFest happens (ADR 0084): FMSB Yaoundé, Amphi 350, with the two
 * Google Maps links the organisers gave — the exact pin, and the place as it
 * is known on Maps.
 *
 * Plain links, no embedded map: nothing third-party loads on the page and the
 * Content-Security-Policy stays as strict as it was. The abbreviation is shown
 * as given (never expanded here) and there is no street address, because none
 * was confirmed.
 *
 * `bare` returns the card alone, for pages that already sit in a section (the
 * reservation page, the tickets page); the default wraps it as a home section.
 */
export async function VenueCard({ bare = false }: { bare?: boolean }) {
  const t = await getTranslations("venue");
  const { latitude, longitude } = EVENT.venueGeo;

  const card = (
    <div
      id="venue"
      className="flex scroll-mt-32 flex-col gap-6 rounded-lg border-2 border-black02 bg-offwhite p-6 shadow-[0_6px_0_0_var(--color-black02)] sm:flex-row sm:items-center sm:justify-between sm:p-8"
    >
      <div className="flex items-start gap-4">
        <MapPinLine
          size={44}
          weight="duotone"
          aria-hidden
          className="mt-1 shrink-0 text-black02"
        />
        <div>
          <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
            {t("label")}
          </p>
          <h2 className="mt-1 font-sans text-heading-l font-bold leading-tight text-black02">
            {EVENT.venue}
          </h2>
          {EVENT.venueRoom && (
            <p className="mt-1 text-heading-m font-bold text-black02/85">
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
      <div className="flex flex-col gap-3 sm:items-end">
        <a
          href={EVENT.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${MAP_BUTTON} bg-primary`}
        >
          {t("openMaps")}
          <ArrowSquareOut size={16} weight="bold" aria-hidden />
          <span className="sr-only">{t("newTab")}</span>
        </a>
        <a
          href={EVENT.mapKnownUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${MAP_BUTTON} bg-offwhite`}
        >
          {t("knownMaps")}
          <ArrowSquareOut size={16} weight="bold" aria-hidden />
          <span className="sr-only">{t("newTab")}</span>
        </a>
      </div>
    </div>
  );

  if (bare) return card;
  return (
    <SectionContainer background="yellow-wash" maxWidth="6xl">
      <Reveal>{card}</Reveal>
    </SectionContainer>
  );
}
