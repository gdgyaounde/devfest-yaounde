import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { About } from "@/components/home/About";
import { CommunityCta } from "@/components/home/CommunityCta";
import { FaqPreview } from "@/components/home/FaqPreview";
import { Hero } from "@/components/home/Hero";
import { MemoryLane } from "@/components/home/MemoryLane";
import { QuotesInterstitial } from "@/components/home/QuotesInterstitial";
import { ScheduleOverviewPreview } from "@/components/home/ScheduleOverviewPreview";
import { SpeakerShowcase } from "@/components/home/SpeakerShowcase";
import { SponsorStrip } from "@/components/home/SponsorStrip";
import { CallForSpeakers } from "@/components/speakers/CallForSpeakers";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { cfsView } from "@/lib/content/cfs";
import { loadSettings } from "@/lib/content/settings";
import { StatsInterstitial } from "@/components/home/StatsInterstitial";
import {
  getFaqs,
  getQuotes,
  getSpeakers,
  getSponsors,
} from "@/lib/content/store";
import { eventJsonLd } from "@/lib/event";
import { JsonLd, pageMetadata } from "@/lib/seo";

// A "Tracks" section (PAGES.md §2.6) is intentionally skipped — tracks
// aren't confirmed for this year, and DESIGN.md/PAGES.md forbid inventing
// content that isn't confirmed. Revisit once tracks are decided.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return pageMetadata({
    locale,
    title: "DevFest Yaoundé",
    description: t("metaDesc"),
    ogTitle: "DevFest Yaoundé",
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const [speakers, quotes, faqs, sponsors, settings] = await Promise.all([
    getSpeakers(),
    getQuotes(),
    getFaqs(),
    getSponsors(),
    loadSettings(),
  ]);
  const cfs = cfsView(settings.cfs, speakers.length);

  return (
    <main id="main-content" tabIndex={-1} className="flex-1">
      {/* Structured data uses the same admin date as the public hero. */}
      <JsonLd
        data={eventJsonLd(locale === "en" ? "en" : "fr", t("metaDesc"), [
          settings.eventDate,
        ])}
      />
      <Hero
        locale={locale}
        eventDate={settings.eventDate}
        backdropUrl={settings.hero.imageUrl}
        currentGalleryUrl={settings.memoryLane.currentGalleryUrl}
      />
      {/*
        The sponsor strip used to be layer 4 INSIDE the hero. The redesign
        gives the bottom edge to the wordmark (ADR 0044), and two things
        cannot both hug it — so the strip sits directly below the hero
        instead. Same strip, same position on screen, one section later.
      */}
      <SponsorStrip sponsors={sponsors} call={settings.sponsorCall} />
      <About />
      <StatsInterstitial />
      {/*
        The lineup, or the ask that fills it. Decided on the server from the
        store, so the front page never shows an empty speaker reel.
      */}
      {cfs.state === "lineup" ? (
        <SpeakerShowcase speakers={speakers} />
      ) : (
        <SectionContainer background="yellow-wash" maxWidth="6xl">
          <CallForSpeakers view={cfs} compact />
        </SectionContainer>
      )}
      <ScheduleOverviewPreview />
      <QuotesInterstitial quotes={quotes} />
      <MemoryLane />
      <CommunityCta />
      <FaqPreview faqs={faqs} />
    </main>
  );
}
