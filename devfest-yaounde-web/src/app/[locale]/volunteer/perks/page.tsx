import { setRequestLocale } from "next-intl/server";
import { PerkStation } from "@/components/staff/PerkStation";
import { stationTiers } from "../stations";

/** The meal and swag tables (ADR 0079). */
export default async function PerksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PerkStation tiers={await stationTiers()} />;
}
