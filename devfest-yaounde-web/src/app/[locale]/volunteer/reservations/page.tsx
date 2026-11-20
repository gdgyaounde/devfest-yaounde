import { setRequestLocale } from "next-intl/server";
import { ReservationStation } from "@/components/staff/ReservationStation";
import { requireGuide } from "@/lib/staff/guide-ack";

/** Reservations: find, take the cash, check in (ADR 0084, 0092). */
export default async function ReservationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuide(locale);
  return <ReservationStation />;
}
