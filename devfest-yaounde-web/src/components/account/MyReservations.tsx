"use client";

import { CalendarCheck, MapPinLine } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSalesPhase } from "@/components/global/SalesPhaseProvider";
import { Badge } from "@/components/ui/Badge";
import { Link } from "@/i18n/navigation";
import { EVENT } from "@/lib/event";
import type { MyReservation } from "@/lib/reservations/types";

/**
 * "My reservations" (ADR 0084): what the signed-in person reserved, its
 * reference, what is owed in cash at the venue, and a cancel button while
 * reservations are open and the cash has not been taken. Self-fetching, so
 * the account dashboard only mounts it.
 */
export function MyReservations() {
  const t = useTranslations("pages.account.reservations");
  const locale = useLocale() === "en" ? "en" : "fr";
  const phase = useSalesPhase();
  const [rows, setRows] = useState<MyReservation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/reservations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { reservations: [] }))
      .then((body: { reservations?: MyReservation[] }) => {
        if (live) setRows(body.reservations ?? []);
      })
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);

  const money = (value: number) =>
    `${new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM").format(value)} XAF`;

  async function cancel(row: MyReservation) {
    if (!window.confirm(t("confirmCancel", { reference: row.reference })))
      return;
    setBusy(row.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/reservations/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (response.ok) {
        setRows((list) =>
          (list ?? []).map((r) =>
            r.id === row.id ? { ...r, status: "cancelled" } : r,
          ),
        );
      } else {
        setNotice(t("cancelFailed"));
      }
    } catch {
      setNotice(t("cancelFailed"));
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) {
    return <p className="text-body-m text-black02/70">{t("loading")}</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-black02/40 px-6 py-10 text-center">
        <p className="font-sans text-heading-m font-bold text-black02">
          {t("emptyTitle")}
        </p>
        <p className="mx-auto mt-2 max-w-prose text-body-m text-black02/75">
          {phase === "reserving"
            ? t("emptyReserving")
            : phase === "selling"
              ? t("emptySelling")
              : t("emptyDoor", { venue: EVENT.venue ?? EVENT.city })}
        </p>
        {phase === "reserving" && (
          <Link
            href="/reserve"
            className="mt-5 inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)]"
          >
            <CalendarCheck size={18} weight="bold" aria-hidden />
            {t("reserveCta")}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p role="alert" className="text-body-m font-bold text-danger-ink">
          {notice}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {rows.map((row) => {
          const cancelled = row.status === "cancelled";
          return (
            <li
              key={row.id}
              className={`rounded-lg border-2 border-black02 p-6 ${cancelled ? "bg-offwhite opacity-70" : "bg-offwhite"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-heading-m font-bold tracking-wider text-black02">
                  {row.reference}
                </p>
                <Badge
                  tone={
                    row.status === "cash_received"
                      ? "success"
                      : cancelled
                        ? "danger"
                        : "primary"
                  }
                  variant="outline"
                >
                  {t(`status.${row.status}`)}
                </Badge>
              </div>

              <ul className="mt-4 flex flex-col gap-1.5 text-body-m text-black02">
                {row.tickets.map((ticket, i) => (
                  <li key={`t${i}`}>
                    <span className="font-mono text-mono-tag font-bold uppercase">
                      {ticket.tierName ?? ticket.tierId}
                    </span>{" "}
                    · {ticket.name}
                    {ticket.apparelSize ? ` · ${ticket.apparelSize}` : ""}
                  </li>
                ))}
                {row.items.map((item, i) => (
                  <li key={`i${i}`}>
                    <span className="font-bold">{item.quantity} ×</span>{" "}
                    {item.productName?.[locale] ?? item.productId}
                    {item.variant
                      ? ` · ${[item.variant.size, item.variant.color].filter(Boolean).join(" · ")}`
                      : ""}
                  </li>
                ))}
              </ul>

              <p className="mt-4 font-mono text-body-l font-bold text-black02">
                {t("toPay", { total: money(row.totalXaf) })}
              </p>
              {!cancelled && (
                <p className="mt-1 flex items-start gap-2 text-caption text-black02/70">
                  <MapPinLine
                    size={14}
                    weight="bold"
                    aria-hidden
                    className="mt-0.5 shrink-0"
                  />
                  {t("payAt", { venue: EVENT.venue ?? EVENT.city })}
                </p>
              )}

              {row.status === "reserved" && phase === "reserving" && (
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => void cancel(row)}
                  className="mt-5 rounded-pill border-2 border-danger px-5 py-2 font-sans text-caption font-bold text-danger-ink hover:bg-danger-pastel disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
