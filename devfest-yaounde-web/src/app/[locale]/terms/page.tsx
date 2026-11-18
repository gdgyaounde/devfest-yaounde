import type { Metadata } from "next";
import {
  ArrowSquareOut,
  CheckCircle,
  ForkKnife,
} from "@phosphor-icons/react/dist/ssr";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo";
import { mailtoHref } from "@/lib/mailto";
import { CHAPTER_EMAIL, GDG_CODE_OF_CONDUCT_URL } from "@/lib/site-config";
import { loadSettings } from "@/lib/content/settings";
import { getSwagProducts, getTiers } from "@/lib/content/store";
import { feeInclusiveAmount } from "@/lib/payments/fees";
import { formatCutoff, salesPhase } from "@/lib/event";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.terms" });
  return pageMetadata({
    locale,
    path: "/terms",
    title: t("title"),
    description: t("metaDesc"),
  });
}

const SECTIONS = [
  "what",
  "passes",
  "food",
  "entry",
  "changes",
  "refunds",
  "photos",
  "conduct",
  "contact",
] as const;

const H2 = "font-sans text-heading-l font-bold leading-tight text-black02";
const BODY = "mt-4 text-body-l leading-relaxed text-black02/80";
const LINK_BTN =
  "inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none";

/**
 * `/{locale}/terms` — the participation terms, on-site (ADR 0074).
 *
 * The footer's "Participation terms" used to point at GDG's page, which
 * covers conduct but says nothing about what a DevFest pass includes — and
 * that is exactly what people need to know before Saturday. This page says
 * it plainly, and links GDG's code of conduct for the rest (ADR 0040).
 *
 * The tier table is GENERATED from `ticket-tiers` (the same store the
 * tickets page reads), so the two can never disagree about a perk. The
 * version and date at the top come from `legal.termsVersion` /
 * `legal.termsUpdatedAt`; bumping the version re-shows the pop-up.
 */
export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale === "en" ? "en" : "fr";
  const t = await getTranslations("pages.terms");
  const [settings, tiers, products] = await Promise.all([
    loadSettings(),
    getTiers(),
    getSwagProducts(),
  ]);

  const productName = new Map(products.map((p) => [p.id, p.name[l]]));
  const onSale = tiers.filter((tier) => tier.onSale);
  const updated = formatCutoff(
    l,
    `${settings.legal.termsUpdatedAt}T12:00:00+01:00`,
  );
  const editsClose = formatCutoff(l, settings.ticketing.editsCloseAt);
  // Online the 1.5 % fee is part of the price; once payments close it is cash
  // at the venue, at the base price (ADR 0084). Rebuilt by the cron at noon.
  const selling = salesPhase(new Date(), settings) === "selling";
  const money = (value: number) =>
    new Intl.NumberFormat(l === "fr" ? "fr-CM" : "en-CM").format(value);

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 pt-32 sm:pt-28">
      <SectionContainer background="yellow-wash" maxWidth="4xl">
        <p className="inline-flex -rotate-1 items-center rounded-pill border-2 border-black02 bg-offwhite px-4 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02">
          {t("version", {
            version: settings.legal.termsVersion,
            date: updated
              ? `${updated.date.replace(/^\S+\s/, "")} ${settings.legal.termsUpdatedAt.slice(0, 4)}`
              : settings.legal.termsUpdatedAt,
          })}
        </p>
        <h1 className="mt-6 font-sans text-display-hero font-bold leading-[0.9] text-black02">
          <ScrambleText text={t("title")} />
        </h1>
        <p className="mt-6 max-w-2xl text-body-l text-black02/80">
          {t("lead")}
        </p>

        <nav aria-label={t("toc")} className="mt-10">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map((id) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex rounded-pill border-2 border-black02/30 px-3.5 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/75 transition-colors hover:border-black02 hover:bg-primary hover:text-black02"
                >
                  {t(`${id}Title`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section id="what" className="mt-16 scroll-mt-40">
          <h2 className={H2}>{t("whatTitle")}</h2>
          <p className={BODY}>{t("whatBody")}</p>
        </section>

        {/* Generated from ticket-tiers, so it cannot drift from /tickets. */}
        <section id="passes" className="mt-16 scroll-mt-40">
          <h2 className={H2}>{t("passesTitle")}</h2>
          <p className={BODY}>{t("passesBody")}</p>
          <div className="mt-6 overflow-hidden rounded-lg border-2 border-black02 bg-offwhite shadow-[0_6px_0_0_var(--color-black02)]">
            <table className="w-full border-collapse text-left">
              <thead className="max-sm:sr-only">
                <tr className="border-b-2 border-black02 bg-primary">
                  <th
                    scope="col"
                    className="px-5 py-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02"
                  >
                    {t("colPass")}
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02"
                  >
                    {t("colPrice")}
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02"
                  >
                    {t("colIncludes")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {onSale.map((tier) => {
                  const free = tier.priceXAF <= 0;
                  const swag = free
                    ? []
                    : (tier.swagProductIds ?? [])
                        .map((id) => productName.get(id))
                        .filter((n): n is string => Boolean(n));
                  return (
                    <tr
                      key={tier.id}
                      className="border-b-2 border-black02/15 align-top last:border-b-0 max-sm:block max-sm:px-5 max-sm:py-4"
                    >
                      <th
                        scope="row"
                        className="px-5 py-4 max-sm:block max-sm:p-0"
                      >
                        <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02">
                          {tier.name}
                        </span>
                        {tier.label?.[l] && (
                          <span className="mt-1 block text-caption font-normal text-black02/65">
                            {tier.label[l]}
                          </span>
                        )}
                      </th>
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-body-m font-bold text-black02 max-sm:block max-sm:p-0 max-sm:pt-1">
                        {free
                          ? t("free")
                          : `${money(
                              selling
                                ? feeInclusiveAmount(tier.priceXAF)
                                : tier.priceXAF,
                            )} XAF`}
                        {tier.rsvpExternal && (
                          <span className="block font-sans text-caption font-normal text-black02/65">
                            {t("rsvp")}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 max-sm:block max-sm:p-0 max-sm:pt-3">
                        <ul className="flex flex-col gap-1.5">
                          {tier.perks.map((perk, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-body-m text-black02/85"
                            >
                              <CheckCircle
                                size={18}
                                weight="bold"
                                aria-hidden
                                className="mt-0.5 shrink-0 text-black02"
                              />
                              {perk.label[l]}
                            </li>
                          ))}
                        </ul>
                        {swag.length > 0 && (
                          <p className="mt-2 text-caption text-black02/65">
                            {t("inTheBox", { items: swag.join(", ") })}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* The rule itself — the loudest block on the page, on purpose. */}
        <section
          id="food"
          className="mt-16 scroll-mt-40 rounded-lg border-2 border-black02 bg-primary p-6 shadow-[0_6px_0_0_var(--color-black02)] sm:p-8"
        >
          <div className="flex items-center gap-3">
            <ForkKnife
              size={32}
              weight="duotone"
              aria-hidden
              className="shrink-0 text-black02"
            />
            <h2 className={H2}>{t("foodTitle")}</h2>
          </div>
          <p className="mt-4 text-body-l font-bold leading-relaxed text-black02">
            {t("foodRule")}
          </p>
          <p className="mt-4 text-body-m leading-relaxed text-black02/85">
            {t("foodWhy")}
          </p>
        </section>

        <section id="entry" className="mt-16 scroll-mt-40">
          <h2 className={H2}>{t("entryTitle")}</h2>
          <p className={BODY}>{t("entryFree")}</p>
          <p className="mt-3 text-body-l leading-relaxed text-black02/80">
            {t("entryNoBadge")}
          </p>
          <p className="mt-3 text-body-l leading-relaxed text-black02/80">
            {t("entryPaid")}
          </p>
        </section>

        {editsClose && (
          <section id="changes" className="mt-16 scroll-mt-40">
            <h2 className={H2}>{t("changesTitle")}</h2>
            <p className={BODY}>
              {t("changesBody", {
                date: editsClose.date,
                time: editsClose.time,
              })}
            </p>
            <div className="mt-5">
              <Link href="/account" className={LINK_BTN}>
                {t("changesCta")}
              </Link>
            </div>
          </section>
        )}

        <section id="refunds" className="mt-16 scroll-mt-40">
          <h2 className={H2}>{t("refundsTitle")}</h2>
          <p className={BODY}>{t("refundsBody")}</p>
          <div className="mt-5">
            <Link href="/faqs#faq-section-tickets" className={LINK_BTN}>
              {t("refundsCta")}
            </Link>
          </div>
        </section>

        <section id="photos" className="mt-16 scroll-mt-40">
          <h2 className={H2}>{t("photosTitle")}</h2>
          <p className={BODY}>{t("photosBody")}</p>
          <div className="mt-5">
            <Link href="/wall/terms" className={LINK_BTN}>
              {t("photosCta")}
            </Link>
          </div>
        </section>

        <section id="conduct" className="mt-16 scroll-mt-40">
          <h2 className={H2}>{t("conductTitle")}</h2>
          <p className={BODY}>{t("conductBody")}</p>
          <div className="mt-5">
            <a
              href={GDG_CODE_OF_CONDUCT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_BTN}
            >
              {t("conductCta")}
              <ArrowSquareOut size={16} weight="bold" aria-hidden />
            </a>
          </div>
        </section>

        <section id="contact" className="mt-16 scroll-mt-40">
          <h2 className={H2}>{t("contactTitle")}</h2>
          <p className={BODY}>{t("contactBody")}</p>
          <div className="mt-5">
            <a
              href={mailtoHref(CHAPTER_EMAIL, { subject: t("contactSubject") })}
              className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none"
            >
              {t("contactCta")}
            </a>
          </div>
        </section>
      </SectionContainer>
    </main>
  );
}
