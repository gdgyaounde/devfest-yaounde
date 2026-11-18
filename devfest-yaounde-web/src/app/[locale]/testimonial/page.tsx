import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TestimonialComposer } from "@/components/testimonials/TestimonialComposer";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "testimonial" });
  return pageMetadata({
    locale,
    path: "/testimonial",
    title: t("metaTitle"),
    description: t("metaDesc"),
    // A form to fill in, reached by a shared link or a QR code — not a
    // page anyone needs to find through a search engine.
    index: false,
  });
}

/**
 * `/{locale}/testimonial` — leave a few anonymous words about DevFest
 * Yaoundé (ADR 0087). One screen, no chrome: see `TestimonialComposer`.
 */
export default async function TestimonialPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TestimonialComposer />;
}
