import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VoteBallot, type BallotProject } from "@/components/vote/VoteBallot";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { getSponsors } from "@/lib/content/store";
import { formatCutoff } from "@/lib/event";
import { PITCH_PROJECTS } from "@/lib/pitch-vote";
import { pageMetadata } from "@/lib/seo";
import { VOTE_CLOSES_AT } from "@/lib/site-config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.vote" });
  return pageMetadata({
    locale,
    path: "/vote",
    title: t("title"),
    description: t("metaDesc"),
    // Reached by a shared link, for a few days: nothing for a search engine.
    index: false,
  });
}

/** The contest's partner, from the sponsors collection (ADR 0099). */
const IMPACT_HUB_ID = "impact-hub-yaounde";
const IMPACT_HUB_FALLBACK = {
  name: "Impact Hub Yaoundé",
  logoUrl: "/sponsors/impact-hub-yaounde.png",
  websiteUrl: "https://yaounde.impacthub.net/",
};

/**
 * `/{locale}/vote` — the pitch contest's public vote (ADR 0099).
 *
 * The projects are rendered here, on the server, so they read the same for
 * everyone; `VoteBallot` adds what depends on who is looking — signed in or
 * not, checked in or not, their current vote — and, once voting has closed,
 * the results. The contest's partner, Impact Hub Yaoundé, is credited at the
 * top with its logo.
 */
export default async function VotePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale === "en" ? "en" : "fr";
  const t = await getTranslations("pages.vote");
  const sponsors = await getSponsors();
  const hub = sponsors.find((s) => s.id === IMPACT_HUB_ID);
  const partner = {
    name: hub?.name ?? IMPACT_HUB_FALLBACK.name,
    logoUrl: hub?.logoUrl || IMPACT_HUB_FALLBACK.logoUrl,
    websiteUrl: hub?.websiteUrl || IMPACT_HUB_FALLBACK.websiteUrl,
  };
  const closes = formatCutoff(l, VOTE_CLOSES_AT);

  const projects: BallotProject[] = PITCH_PROJECTS.map((p) => ({
    id: p.id,
    team: p.team,
    name: p.name,
    tagline: p.tagline[l],
    pitch: p.pitch,
    url: p.url,
    note: p.note?.[l],
  }));

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 pt-32 sm:pt-28">
      <SectionContainer background="yellow-wash" maxWidth="4xl">
        <p className="font-mono text-mono-tag font-bold uppercase text-black02/70">
          {t("eyebrow")}
        </p>
        <h1 className="mt-4 font-sans text-display-hero font-bold leading-[0.9] text-black02">
          <ScrambleText text={t("title")} />
        </h1>
        <p className="mt-6 max-w-2xl text-body-l text-black02/80">
          {t("lead")}
        </p>

        {/* The contest's partner — always credited, open or closed. */}
        <a
          href={partner.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-4 rounded-lg border-2 border-black02 bg-offwhite py-3 pl-5 pr-6 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 motion-reduce:transform-none"
        >
          <span className="font-mono text-mono-tag font-bold uppercase text-black02/70">
            {t("poweredBy")}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element -- a sponsor logo, possibly remote */}
          <img
            src={partner.logoUrl}
            alt={partner.name}
            className="h-12 w-auto object-contain sm:h-16"
          />
        </a>

        <div className="mt-12">
          <VoteBallot
            locale={l}
            projects={projects}
            closes={closes ?? { date: "", short: "", time: "" }}
          />
        </div>
      </SectionContainer>
    </main>
  );
}
