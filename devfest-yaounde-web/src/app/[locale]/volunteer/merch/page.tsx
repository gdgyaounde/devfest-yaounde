import { setRequestLocale } from "next-intl/server";
import { MerchStation } from "@/components/staff/MerchStation";

/** The merch pickup table (ADR 0079). */
export default async function MerchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MerchStation />;
}
