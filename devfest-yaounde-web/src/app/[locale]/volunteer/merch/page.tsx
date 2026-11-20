import { setRequestLocale } from "next-intl/server";
import { requireGuide } from "@/lib/staff/guide-ack";
import { MerchStation } from "@/components/staff/MerchStation";

/** The merch pickup table (ADR 0079). */
export default async function MerchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuide(locale);
  return <MerchStation />;
}
