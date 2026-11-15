import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { SpeakerBrowser } from "@/components/speakers/SpeakerBrowser";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { getSessions, getSpeakers } from "@/lib/content/store";
import { loadSettings } from "@/lib/content/settings";
import { cfsView } from "@/lib/content/cfs";
import { CallForSpeakers } from "@/components/speakers/CallForSpeakers";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.speakers" });
  return pageMetadata({
    locale,
    path: "/speakers",
    title: t("title"),
    description: t("metaDesc"),
  });
}

export default async function SpeakersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.speakers");
  const [allSpeakers, settings, sessions] = await Promise.all([
    getSpeakers(),
    loadSettings(),
    getSessions(),
  ]);
  /*
   * Every profile shows its talk (ADR 0073). Resolved here, on the server,
   * from each speaker's `sessionIds`, so the client gets exactly the sessions
   * it renders. An id that no longer resolves is skipped, never an error.
   */
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const withTalks = allSpeakers.map((speaker) => ({
    ...speaker,
    talks: speaker.sessionIds
      .map((id) => sessionById.get(id))
      .filter((s) => s !== undefined),
  }));
  /*
   * Decided on the SERVER, from the store. Until somebody is announced this
   * page is an invitation rather than an empty grid with filters over it —
   * and the switch happens the moment the first speaker is saved, with no
   * deploy and nothing to remember to turn off.
   */
  const cfs = cfsView(settings.cfs, allSpeakers.length);

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 pt-32 sm:pt-28">
      <SectionContainer background="yellow-wash" maxWidth="7xl">
        {/* Scramble egg (PHASE11 §1) — deliberately NOT on every page
            headline; /schedule and /faqs stay plain so this reads as a find
            rather than a site-wide tic. */}
        <h1 className="font-sans text-display-hero font-bold leading-[0.9] text-black02">
          <ScrambleText text={t("title")} />
        </h1>
        <p className="mt-6 max-w-2xl text-body-l text-black02/80">
          {cfs.state === "lineup" ? t("lead") : t("cfsLead")}
        </p>

        <div className="mt-16">
          {cfs.state === "lineup" ? (
            /*
              SpeakerGrid reads `?spk=` via useSearchParams, which needs a
              Suspense boundary so the rest of the page can still be
              statically prerendered.
            */
            <Suspense fallback={null}>
              <SpeakerBrowser speakers={withTalks} />
            </Suspense>
          ) : (
            <CallForSpeakers view={cfs} />
          )}
        </div>
      </SectionContainer>
    </main>
  );
}
