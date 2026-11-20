import { setRequestLocale } from "next-intl/server";
import { DoorStation } from "@/components/staff/DoorStation";
import { requireGuide } from "@/lib/staff/guide-ack";
import { stationTiers } from "../stations";

/** The door (ADR 0078, 0079). Camera allowed on this tree only — next.config.ts. */
export default async function DoorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuide(locale);
  return <DoorStation tiers={await stationTiers()} />;
}
