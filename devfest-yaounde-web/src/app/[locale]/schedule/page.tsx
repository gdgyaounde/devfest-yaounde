import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { getSessions, getSpeakers, getSponsors } from "@/lib/content/store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.schedule" });
  return pageMetadata({
    locale,
    path: "/schedule",
    title: t("title"),
    description: t("metaDesc"),
  });
}

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.schedule");
  const [allSessions, speakers, partners] = await Promise.all([
    getSessions(),
    getSpeakers(),
    getSponsors(),
  ]);

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 pt-32 sm:pt-28">
      <SectionContainer background="yellow-wash" maxWidth="6xl">
        <h1 className="font-sans text-display-hero font-bold leading-[0.9] text-black02">
          <ScrambleText text={t("title")} />
        </h1>
        <p className="mt-6 max-w-2xl text-body-l text-black02/80">
          {t("lead")}
        </p>

        <div className="mt-16">
          {/* Same board as the Home preview, with filters and calendar on */}
          <ScheduleBoard
            sessions={allSessions}
            speakers={speakers}
            partners={partners}
            showFilters
            showCalendar
          />
        </div>
      </SectionContainer>
    </main>
  );
}
