"use client";

import { CalendarCheck, MapPinLine } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useSalesPhase } from "@/components/global/SalesPhaseProvider";
import { Button } from "@/components/ui/Button";
import { EVENT } from "@/lib/event";

/**
 * The bag page (ADR 0084). While payments are online it is the ordinary
 * checkout. Once they close nothing is paid on the site: the bag becomes a
 * RESERVATION (continue on `/reserve`, which reads the same device-local
 * bag), and after the reservation deadline it points at the venue.
 */
export function ShopCartGate({ children }: { children: ReactNode }) {
  const t = useTranslations("reservations");
  const phase = useSalesPhase();
  if (phase === "selling") return <>{children}</>;

  const reserving = phase === "reserving";
  return (
    <section className="flex max-w-2xl flex-col gap-5 rounded-lg border-2 border-black02 bg-offwhite p-6 sm:p-8">
      <h2 className="font-sans text-heading-l font-bold leading-tight text-black02">
        {reserving ? t("bagTitleReserving") : t("bagTitleDoor")}
      </h2>
      <p className="text-body-m text-black02/80">
        {reserving
          ? t("bagBodyReserving")
          : t("bagBodyDoor", { venue: EVENT.venue ?? EVENT.city })}
      </p>
      {reserving ? (
        <Button size="md" href="/reserve">
          <CalendarCheck size={18} weight="bold" aria-hidden />
          {t("continueToReservation")}
        </Button>
      ) : (
        <Button size="md" href={EVENT.mapUrl} external>
          <MapPinLine size={18} weight="bold" aria-hidden />
          {t("seeVenue")}
        </Button>
      )}
    </section>
  );
}
