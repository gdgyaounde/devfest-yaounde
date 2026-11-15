import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { ShopBrowser } from "@/components/shop/ShopBrowser";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { feeInclusiveAmount } from "@/lib/payments/fees";
import productsJson from "@/data/products.json";
import { getProducts } from "@/lib/content/store";
import type { Product } from "@/data/types";
import { ShopLateNotice } from "@/components/shop/ShopLateNotice";
import { shopLateNotice } from "@/lib/content/shop-notice";

/** Seed from the repo file so a build without the database still prerenders. */
export function generateStaticParams() {
  return (productsJson as Product[]).map((p) => ({ product: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; product: string }>;
}) {
  const { locale, product } = await params;
  const catalog = await getProducts();
  const found = catalog.find((p) => p.id === product);
  if (!found) return {};
  const l = locale as "fr" | "en";

  /* The shared helper for canonical, hreflang and the card, then the product
     PHOTO replaces the generated image — a real picture of the thing beats a
     rendered title card when the link is to something you can buy. */
  const base = pageMetadata({
    locale,
    path: `/shop/${found.id}`,
    title: found.name[l],
    description: found.description[l],
  });
  const photo = found.images[0];
  return photo
    ? {
        ...base,
        openGraph: { ...base.openGraph, images: [photo] },
        twitter: { ...base.twitter, images: [photo] },
      }
    : base;
}

/**
 * `/{locale}/shop/[product]` — the grid, with this product's drawer already
 * open.
 *
 * WHY THE ROUTE SURVIVED THE MOVE TO A DRAWER. Detail is now a drawer over
 * the catalog, which is better to use — but a drawer alone would have cost
 * every product its own URL, and with it sharing, bookmarking and indexing.
 * So the route stayed, and it renders the same grid with `initialProductId`
 * set. Clicking a card from `/shop` pushes this URL without navigating;
 * arriving at it directly renders here. Same screen either way.
 *
 * SEO, and the honest limit of it: this route carries its own title,
 * description, OpenGraph image and `Product` structured data, and the grid
 * server-renders every product's name, description and price in the cards.
 * What is NOT in the server HTML is the drawer's own body — it is portalled,
 * so it mounts in the browser. The indexable payload is therefore the
 * metadata plus JSON-LD rather than the drawer's markup, which for a product
 * page is the part search engines actually read. Flagged rather than
 * glossed: if rich-result coverage ever falls short, the fix is to
 * server-render the detail beneath the drawer, not to abandon the drawer.
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; product: string }>;
}) {
  const { locale, product } = await params;
  setRequestLocale(locale);
  const catalog = await getProducts();
  const found = catalog.find((p) => p.id === product);
  // A mistyped or retired product id is a 404, not an empty page.
  if (!found) notFound();

  const t = await getTranslations("pages.shop");
  const l = locale as "fr" | "en";
  const lateNotice = await shopLateNotice(locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: found.name[l],
    description: found.description[l],
    image: found.images,
    offers: {
      "@type": "Offer",
      // Fee-inclusive — this must match what a shopper is actually charged
      // at checkout, or Google's own rich-result guidance treats it as a
      // mismatched-price violation.
      price: feeInclusiveAmount(found.priceXAF),
      priceCurrency: "XAF",
      availability:
        found.status === "sold-out"
          ? "https://schema.org/SoldOut"
          : found.status === "pre-order"
            ? "https://schema.org/PreOrder"
            : "https://schema.org/InStock",
    },
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 pt-32 sm:pt-28">
      <script
        type="application/ld+json"
        // Serialised from our own catalog, never from user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SectionContainer background="yellow-wash" maxWidth="6xl">
        <h1 className="font-sans text-display-hero font-bold leading-[0.9] text-black02">
          <ScrambleText text={t("title")} />
        </h1>
        <p className="mt-6 max-w-2xl text-body-l text-black02/80">
          {t("lead")}
        </p>
        <ShopLateNotice text={lateNotice} className="mt-8" />
        <div className="mt-16">
          <ShopBrowser products={catalog} initialProductId={found.id} />
        </div>
      </SectionContainer>
    </main>
  );
}
