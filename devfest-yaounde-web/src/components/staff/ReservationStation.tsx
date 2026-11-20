"use client";

import { useTranslations } from "next-intl";
import { ReservationDoor } from "./ReservationDoor";
import { StationShell } from "./kit";

/**
 * Reservations as a station of their own (ADR 0092), no longer nested under
 * the door: find a reservation, take the cash, check the person in.
 */
export function ReservationStation() {
  const t = useTranslations("staff.reservations");
  return (
    <StationShell title={t("stationTitle")}>
      <p className="text-body-m text-black02/80">{t("stationIntro")}</p>
      <ReservationDoor />
    </StationShell>
  );
}
