import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { loadSettings } from "@/lib/content/settings";
import { TicketCta } from "@/components/tickets/TicketCta";
import { ticketSalesOpen } from "@/lib/event";

/**
 * Pre-footer CTA (PHASE5 §7) — the page's final, loudest "star" moment.
 * Deliberately the most playful section: oversized display-hero type on a
 * full Yellow 600 field, chunky CTA, celebratory copy.
 *
 * Abstract decorative circles removed per PHASE5 §8 — scale and type carry
 * it. The tilted mono strip below the CTA supplies texture without
 * reintroducing abstract blobs.
 */
export async function CommunityCta() {
  const t = await getTranslations("home.community");
  const settings = await loadSettings();
  const { bevyUrl } = settings;

  return (
    <SectionContainer background="yellow" maxWidth="5xl">
      <div className="text-center">
        <Reveal>
          <h2 className="mx-auto max-w-4xl font-sans text-display-hero font-bold leading-[0.95] text-black02">
            {t("title")}
          </h2>
        </Reveal>
        <Reveal index={1}>
          <p className="mx-auto mt-10 max-w-2xl text-body-l text-black02/75">
            {t("body")}
          </p>
        </Reveal>
        <Reveal index={2}>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-4">
            <Button tone="black02" href={bevyUrl} external size="lg">
              {t("cta")}
            </Button>
            {/* Gone after the sales cutoff (ADR 0072) — the community
                link beside it is still a real next step. */}
            <TicketCta
              salesCloseAt={settings.ticketing.salesCloseAt}
              salesOpenAtRender={ticketSalesOpen(new Date(), settings)}
              label={t("ticketsCta")}
              closed="hide"
              tone="black02"
              variant="secondary"
            />
          </div>
        </Reveal>
      </div>
    </SectionContainer>
  );
}
