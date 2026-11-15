import { setRequestLocale } from "next-intl/server";
import { DoorStation } from "@/components/staff/DoorStation";
import { stationTiers } from "../stations";

/** The door (ADR 0078, 0079). Camera allowed on this tree only — next.config.ts. */
export default async function DoorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DoorStation tiers={await stationTiers()} />;
}
