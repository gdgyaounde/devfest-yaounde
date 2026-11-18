import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getProducts } from "@/lib/content/store";
import { SITE_URL } from "@/lib/site-config";

/**
 * Every indexable route, in both languages, each entry naming its own
 * translations.
 *
 * `alternates.languages` matters more than it looks: on a bilingual site it
 * is what tells a crawler that /fr/tickets and /en/tickets are the same page,
 * rather than two pages competing with each other.
 *
 * WHAT IS DELIBERATELY ABSENT: `/account` (personal, and empty to anyone not
 * signed in), `/shop/cart` (someone's bag) and `/payments/return`
 * (meaningless without the deposit id that brought you there). All three
 * carry `robots: noindex` from `pageMetadata`, and this list has to agree
 * with that — a sitemap entry for a noindex page is a crawler being invited
 * to somewhere it is then told to ignore.
 */
const ROUTES = [
  "",
  "/schedule",
  "/speakers",
  "/team",
  "/faqs",
  "/tickets",
  "/reserve",
  "/shop",
  "/dp-generator",
  "/wall/terms",
  "/terms",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getProducts();
  const paths = [
    ...ROUTES,
    ...products.map((product) => `/shop/${product.id}`),
  ];

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: (path === "" ? "weekly" : "monthly") as
        "weekly" | "monthly",
      priority: path === "" ? 1 : path === "/tickets" ? 0.9 : 0.7,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((other) => [
            other,
            `${SITE_URL}/${other}${path}`,
          ]),
        ),
      },
    })),
  );
}
