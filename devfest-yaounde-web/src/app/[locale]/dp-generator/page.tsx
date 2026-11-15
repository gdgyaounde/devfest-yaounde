import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DpGenerator } from "@/components/dp/DpGenerator";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { loadSettings } from "@/lib/content/settings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.dpGenerator" });
  return pageMetadata({
    locale,
    path: "/dp-generator",
    title: t("title"),
    description: t("metaDesc"),
  });
}

/**
 * `/{locale}/dp-generator` — PAGES.md §9.
 *
 * The page is a shell: a heading, and one client component. The source photo
 * stays on the device; the composed card is saved on download/share/copy
 * (ADR 0034). No session is read.
 */
export default async function DpGeneratorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.dpGenerator");
  const settings = await loadSettings();

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
          {/* The sales cutoff decides where the locked collector tiles
              point: /tickets while sales are open, the FAQ after. */}
          <DpGenerator salesCloseAt={settings.ticketing.salesCloseAt} />
        </div>
      </SectionContainer>
    </main>
  );
}
