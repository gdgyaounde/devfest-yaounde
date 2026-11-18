import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VenueCard } from "@/components/home/VenueCard";
import {
  ReservationForm,
  type ReservableProduct,
  type ReservableTier,
} from "@/components/reserve/ReservationForm";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { loadSettings } from "@/lib/content/settings";
import { getProducts, getSwagProducts, getTiers } from "@/lib/content/store";
import { EVENT, formatCutoff, formatEventDates } from "@/lib/event";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.reserve" });
  return pageMetadata({
    locale,
    path: "/reserve",
    title: t("title"),
    description: t("metaDesc"),
  });
}

/**
 * `/{locale}/reserve` — reserve tickets and shop items, pay cash at the venue
 * (ADR 0084). Nothing is paid here, so there is no checkout: the form says
 * what is wanted, the server prices it at BASE price and holds it under a
 * reference. Open only between the payments cutoff and the reservations
 * deadline; the page itself explains the other two phases.
 */
export default async function ReservePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale === "en" ? "en" : "fr";
  const t = await getTranslations("pages.reserve");
  const [settings, tiers, products, swag] = await Promise.all([
    loadSettings(),
    getTiers(),
    getProducts(),
    getSwagProducts(),
  ]);

  const swagName = new Map(swag.map((p) => [p.id, p.name]));
  const reservableTiers: ReservableTier[] = tiers
    .filter((tier) => tier.onSale && !tier.rsvpExternal && tier.priceXAF > 0)
    .map((tier) => ({
      id: tier.id,
      name: tier.name,
      label: tier.label?.[l] ?? "",
      description: tier.description[l],
      priceXAF: tier.priceXAF,
      includesApparel: tier.includesApparel,
      soldOut: Boolean(tier.soldOut),
      box: (tier.swagProductIds ?? [])
        .map((id) => swagName.get(id)?.[l])
        .filter((n): n is string => Boolean(n)),
    }));
  const reservableProducts: ReservableProduct[] = products
    .filter(
      (p) => !p.ticketOnly && p.published !== false && p.status !== "sold-out",
    )
    .map((p) => ({
      id: p.id,
      name: p.name[l],
      priceXAF: p.priceXAF,
    }));

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 pt-32 sm:pt-28">
      <SectionContainer background="yellow-wash" maxWidth="4xl">
        <h1 className="font-sans text-display-hero font-bold leading-[0.9] text-black02">
          <ScrambleText text={t("title")} />
        </h1>
        <p className="mt-6 max-w-2xl text-body-l text-black02/80">
          {t("lead", { venue: EVENT.venue ?? EVENT.city })}
        </p>

        <div className="mt-12">
          <ReservationForm
            tiers={reservableTiers}
            products={reservableProducts}
            reservationsDeadline={formatCutoff(
              l,
              settings.ticketing.reservationsCloseAt,
            )}
            salesClose={formatCutoff(l, settings.ticketing.salesCloseAt)}
            eventDate={formatEventDates(l, [settings.eventDate]) ?? ""}
            venue={EVENT.venue ?? EVENT.city}
          />
        </div>

        <div className="mt-16">
          <VenueCard bare />
        </div>
      </SectionContainer>
    </main>
  );
}
