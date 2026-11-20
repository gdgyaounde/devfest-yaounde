import { setRequestLocale } from "next-intl/server";
import { PerkStation } from "@/components/staff/PerkStation";
import { requireGuide } from "@/lib/staff/guide-ack";
import { stationTiers } from "../stations";

/** The meal and swag tables (ADR 0079). */
export default async function PerksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuide(locale);
  return <PerkStation tiers={await stationTiers()} />;
}
