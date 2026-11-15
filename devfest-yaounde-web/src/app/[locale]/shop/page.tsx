import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShopBrowser } from "@/components/shop/ShopBrowser";
import { AccountLink } from "@/components/account/AccountLink";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { getProducts } from "@/lib/content/store";
import type { Product } from "@/data/types";
import { ShopLateNotice } from "@/components/shop/ShopLateNotice";
import { shopLateNotice } from "@/lib/content/shop-notice";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.shop" });
  return pageMetadata({
    locale,
    path: "/shop",
    title: t("title"),
    description: t("metaDesc"),
  });
}

/**
 * `/{locale}/shop` — the catalog (PAGES.md §8).
 *
 * Products come from `src/data/products.json`, which is also what the server
 * prices against by id — so what is displayed and what is charged cannot
 * drift, and no price is ever sent from the browser.
 *
 * The shop is EVERGREEN: it runs before, during and after the event, so
 * nothing here is written as though the event were still upcoming.
 */
export default async function ShopPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.shop");
  const [products, lateNotice] = await Promise.all([
    getProducts() as Promise<Product[]>,
    shopLateNotice(locale),
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
        <AccountLink label={t("myOrdersLink")} />
        <ShopLateNotice text={lateNotice} className="mt-8" />
        <div className="mt-16">
          <ShopBrowser products={products} />
        </div>
      </SectionContainer>
    </main>
  );
}
