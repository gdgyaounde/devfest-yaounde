import { redirect } from "next/navigation";

/**
 * The door scanner moved to the day-of tools, which volunteers can use too
 * (ADR 0079). Kept so a saved bookmark or home-screen icon still lands at
 * the door.
 */
export default async function LegacyCheckIn({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/volunteer/check-in`);
}
