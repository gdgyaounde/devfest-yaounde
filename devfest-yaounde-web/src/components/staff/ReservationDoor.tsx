"use client";

import { CalendarCheck, MagnifyingGlass } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type {
  ReservationDoorResult,
  StaffReservation,
} from "@/lib/staff/results";
import { MIN_SEARCH_LENGTH } from "@/lib/staff/rules";
import { normaliseReference } from "@/lib/reservations/rules";
import { ACTION, FailurePanel, staffRequest, type Failure } from "./kit";
import { buzz } from "./use-qr-scanner";

type Action = "cash" | "check_in" | "cash_and_check_in";

/**
 * The door's Reservations section (ADR 0084): find a reservation by its
 * reference or by name, see what was reserved and the cash owed, record the
 * cash and check the person in. For people who reserved while online payments
 * were closed — and walk-ins after Friday are simply paid at the table.
 *
 * Never shows a phone or an email. The server row-locks every action, so two
 * phones cannot both take the same cash.
 */
export function ReservationDoor() {
  const t = useTranslations("staff.reservations");
  const locale = useLocale() === "en" ? "en" : "fr";
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<StaffReservation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const q = query.trim();
  const valid =
    normaliseReference(q) !== null ||
    q.replace(/[\s'.-]/g, "").length >= MIN_SEARCH_LENGTH;

  const money = (value: number) =>
    `${new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM").format(value)} XAF`;

  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (!valid) return;
    setLoading(true);
    setFailure(null);
    setNotice(null);
    const response = await staffRequest<{ reservations: StaffReservation[] }>(
      `/api/staff/reservations?q=${encodeURIComponent(q)}`,
    );
    setLoading(false);
    if (response.kind === "ok") setRows(response.body.reservations);
    else setFailure(response);
  }

  async function act(row: StaffReservation, action: Action) {
    setBusy(row.id);
    setNotice(null);
    const response = await staffRequest<ReservationDoorResult>(
      `/api/staff/reservations/${row.id}`,
      { method: "POST", body: JSON.stringify({ action }) },
      [200, 404],
    );
    setBusy(null);
    if (response.kind !== "ok") {
      setFailure(response);
      buzz(260);
      return;
    }
    const result = response.body;
    if (result.status === "ok") {
      setRows((list) =>
        (list ?? []).map((r) => (r.id === row.id ? result.reservation : r)),
      );
      setNotice(
        t(
          action === "check_in"
            ? "doneCheckIn"
            : action === "cash"
              ? "doneCash"
              : "doneBoth",
          { reference: row.reference },
        ),
      );
      buzz(70);
    } else {
      setNotice(t(result.status === "cancelled" ? "cancelled" : "notFound"));
      buzz(260);
    }
  }

  return (
    <section className="rounded-lg border-2 border-black02 bg-offwhite p-4">
      <form onSubmit={(e) => void search(e)}>
        <label
          htmlFor="reservation-search"
          className="flex items-center gap-2 font-sans text-body-m font-bold text-black02"
        >
          <CalendarCheck size={20} weight="bold" aria-hidden />
          {t("title")}
        </label>
        <p
          id="reservation-search-hint"
          className="mt-1 text-caption text-black02/70"
        >
          {t("hint")}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            id="reservation-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-describedby="reservation-search-hint"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="RES-XXXXXX"
            className="min-w-0 flex-1 rounded-md border-2 border-black02 bg-white px-3 py-2.5 text-body-m text-black02 placeholder:text-black02/40"
          />
          <button
            type="submit"
            disabled={!valid || loading}
            className="shrink-0 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_3px_0_0_var(--color-black02)] active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none motion-reduce:transform-none"
          >
            <MagnifyingGlass size={20} weight="bold" aria-label={t("search")} />
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mt-3">
        {failure && (
          <FailurePanel
            failure={failure}
            onRetry={() => void search()}
            onNext={() => setFailure(null)}
          />
        )}
        {notice && (
          <p className="mb-3 rounded-md border-2 border-black02 bg-success-pastel px-3 py-2 text-body-m font-bold text-black02">
            {notice}
          </p>
        )}
        {loading && (
          <p className="text-body-m text-black02/70">{t("searching")}</p>
        )}
        {rows && rows.length === 0 && !loading && (
          <p className="text-body-m text-black02/70">{t("empty")}</p>
        )}
      </div>

      {rows && rows.length > 0 && (
        <ul className="mt-2 flex flex-col gap-4">
          {rows.map((row) => {
            const cancelled = row.status === "cancelled";
            const cash = row.status === "cash_received";
            const checkedIn = row.checkedInAt !== null;
            return (
              <li
                key={row.id}
                className={`rounded-lg border-2 border-black02 p-4 ${cancelled ? "bg-danger-pastel" : "bg-white"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-body-m font-bold text-black02">
                    {row.reference}
                  </span>
                  <span
                    className={`rounded-pill border-2 border-black02 px-3 py-1 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02 ${
                      cancelled
                        ? "bg-danger-pastel"
                        : cash
                          ? "bg-success-pastel"
                          : "bg-primary"
                    }`}
                  >
                    {cancelled
                      ? t("statusCancelled")
                      : cash
                        ? t("statusCash")
                        : t("statusReserved")}
                  </span>
                </div>
                <p className="mt-2 text-body-l font-bold text-black02">
                  {row.name}
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-body-m text-black02">
                  {row.tickets.map((ticket, i) => (
                    <li key={`t${i}`}>
                      <span className="font-mono text-mono-tag font-bold uppercase">
                        {ticket.tierName}
                      </span>{" "}
                      · {ticket.name}
                      {ticket.apparelSize ? ` · ${ticket.apparelSize}` : ""}
                    </li>
                  ))}
                  {row.items.map((item, i) => (
                    <li key={`i${i}`}>
                      <span className="font-bold">{item.quantity} ×</span>{" "}
                      {typeof item.name === "string"
                        ? item.name
                        : item.name[locale]}
                      {item.variant
                        ? ` · ${[item.variant.size, item.variant.color].filter(Boolean).join(" · ")}`
                        : ""}
                    </li>
                  ))}
                </ul>
                {!cancelled && (
                  <p className="mt-3 font-mono text-heading-m font-bold text-black02">
                    {cash
                      ? t("paid", { total: money(row.totalXaf) })
                      : t("owed", { total: money(row.totalXaf) })}
                  </p>
                )}
                {checkedIn && (
                  <p className="mt-1 text-caption font-bold text-black02/70">
                    {t("alreadyIn")}
                  </p>
                )}
                {cancelled ? (
                  <p className="mt-3 text-body-m font-bold text-danger-ink">
                    {t("cancelled")}
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!cash && !checkedIn && (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void act(row, "cash_and_check_in")}
                        className={`${ACTION} bg-primary`}
                      >
                        {t("cashAndIn")}
                      </button>
                    )}
                    {!cash && checkedIn && (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void act(row, "cash")}
                        className={`${ACTION} bg-primary`}
                      >
                        {t("cashOnly")}
                      </button>
                    )}
                    {cash && !checkedIn && (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void act(row, "check_in")}
                        className={`${ACTION} bg-primary`}
                      >
                        {t("checkInOnly")}
                      </button>
                    )}
                    {!cash && !checkedIn && (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void act(row, "check_in")}
                        className={ACTION}
                      >
                        {t("checkInOnly")}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
