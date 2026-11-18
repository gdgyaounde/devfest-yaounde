import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShopCartGate } from "@/components/shop/ShopCartGate";
import { ShopCheckout } from "@/components/shop/ShopCheckout";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { getProducts } from "@/lib/content/store";
import type { Product } from "@/data/types";
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
    path: "/shop/cart",
    title: t("bagTitle"),
    description: t("metaDesc"),
    index: false,
  });
}

/** `/{locale}/shop/cart` — the bag and its checkout (Part A's wizard). */
export default async function CartPage({
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
          <ScrambleText text={t("bagTitle")} />
        </h1>
        <div className="mt-14">
          <ShopCartGate>
            <ShopCheckout products={products} lateNotice={lateNotice} />
          </ShopCartGate>
        </div>
      </SectionContainer>
    </main>
  );
}
