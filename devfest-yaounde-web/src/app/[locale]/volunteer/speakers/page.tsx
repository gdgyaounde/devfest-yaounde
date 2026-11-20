import { setRequestLocale } from "next-intl/server";
import { SpeakerStation } from "@/components/staff/SpeakerStation";
import { requireGuide } from "@/lib/staff/guide-ack";

/** The speaker check-in (ADR 0092). */
export default async function SpeakersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuide(locale);
  return <SpeakerStation />;
}
