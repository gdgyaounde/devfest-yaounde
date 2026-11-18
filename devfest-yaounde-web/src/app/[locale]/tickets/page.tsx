import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TicketCheckout } from "@/components/tickets/TicketCheckout";
import { CapacityCounter } from "@/components/tickets/CapacityCounter";
import { AccountLink } from "@/components/account/AccountLink";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { loadSettings } from "@/lib/content/settings";
import { getSwagProducts, getTiers } from "@/lib/content/store";
import { getTicketCapacity } from "@/lib/payments/capacity";
import { VenueCard } from "@/components/home/VenueCard";
import { SalesCutoffNotice } from "@/components/tickets/SalesCutoffNotice";
import { formatCutoff, formatEventDates, ticketEditsOpen } from "@/lib/event";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.tickets" });
  return pageMetadata({
    locale,
    path: "/tickets",
    title: t("title"),
    description: t("metaDesc"),
  });
}

/**
 * `/{locale}/tickets` — tier selection and checkout (PAGES.md §7).
 *
 * Tiers are read via `getTiers()` — the editorial content store, admin-
 * editable (Phase 20), falling back to `src/data/ticket-tiers.json` on a
 * fresh clone with no database. What is NOT sent when the order is placed:
 * no price. The server recomputes every total from this same source by id,
 * so what is shown and what is charged cannot drift, and a tampered request
 * body changes nothing.
 */
export default async function TicketsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.tickets");
  const [tiers, settings, capacity, products] = await Promise.all([
    getTiers(),
    loadSettings(),
    getTicketCapacity(),
    // PUBLISHED products only — a hidden (draft) listing must not appear on a
    // ticket — but INCLUDING ticket-only ones, which are deliberately not in
    // the shop. An id pointing at a hidden or deleted listing simply resolves
    // to nothing and is skipped in the preview.
    getSwagProducts(),
  ]);

  /*
   * Resolved here, on the server, rather than shipping the whole catalog to
   * the client for it to look ids up in. Only the products some tier
   * actually references cross the wire.
   */
  const referenced = new Set(
    tiers.flatMap((tier) => tier.swagProductIds ?? []),
  );
  const swagProducts = products.filter((product) => referenced.has(product.id));

  /*
   * The sales cutoff (ADR 0072). `salesOpen` is only what was true when this
   * HTML was rendered — the page is static — so the client components take
   * the instant too and flip on their own at the minute. Checkout refuses a
   * late purchase on the server whatever this page says.
   */
  const l = locale === "en" ? "en" : "fr";
  const cutoff = formatCutoff(l, settings.ticketing.salesCloseAt);
  const reservationsCutoff = formatCutoff(
    l,
    settings.ticketing.reservationsCloseAt,
  );
  const eventDateLabel = formatEventDates(l, [settings.eventDate]) ?? "";

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 pt-32 sm:pt-28">
      <SectionContainer background="yellow-wash" maxWidth="6xl">
        <h1 className="font-sans text-display-hero font-bold leading-[0.9] text-black02">
          <ScrambleText text={t("title")} />
        </h1>
        <p className="mt-6 max-w-2xl text-body-l text-black02/80">
          {t("lead")}
        </p>
        <AccountLink label={t("myTicketsLink")} />

        {capacity.total != null && (
          <div className="mt-6">
            <CapacityCounter initial={capacity} />
          </div>
        )}

        <SalesCutoffNotice
          salesCloseAt={settings.ticketing.salesCloseAt}
          closeDate={cutoff?.date ?? null}
          closeTime={cutoff?.time ?? null}
          eventDate={eventDateLabel}
          reservationsDeadline={reservationsCutoff}
          editsDeadline={
            ticketEditsOpen(new Date(), settings)
              ? formatCutoff(l, settings.ticketing.editsCloseAt)
              : null
          }
        />

        <div className="mt-10">
          <VenueCard bare />
        </div>

        <div className="mt-16">
          <TicketCheckout
            tiers={tiers}
            swagProducts={swagProducts}
            bevyUrl={settings.bevyUrl}
          />
        </div>
      </SectionContainer>
    </main>
  );
}
