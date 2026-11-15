"use client";

import { MagnifyingGlass, Package } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type { StaffOrder } from "@/lib/staff/results";
import { MIN_SEARCH_LENGTH } from "@/lib/staff/rules";
import {
  ACTION,
  FailurePanel,
  StationShell,
  staffRequest,
  type Failure,
} from "./kit";
import { buzz } from "./use-qr-scanner";

type Notice = { tone: "ok" | "bad"; text: string } | null;

/**
 * The merch table (ADR 0079): find a pickup order by the buyer's name or the
 * order number on their account page, check the items, mark it handed over.
 * No camera — shop orders carry no QR.
 */
export function MerchStation() {
  const t = useTranslations("staff.merch");
  const tc = useTranslations("staff.common");
  const locale = useLocale() === "en" ? "en" : "fr";

  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<StaffOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [handedOver, setHandedOver] = useState(0);

  const tooShort = query.replace(/^#/, "").trim().length < MIN_SEARCH_LENGTH;

  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (tooShort) return;
    setLoading(true);
    setFailure(null);
    setNotice(null);
    const response = await staffRequest<{ orders: StaffOrder[] }>(
      `/api/staff/orders?q=${encodeURIComponent(query.trim())}`,
    );
    setLoading(false);
    if (response.kind === "ok") setOrders(response.body.orders);
    else setFailure(response);
  }

  async function handOver(order: StaffOrder) {
    setBusyId(order.id);
    setNotice(null);
    const response = await staffRequest<{ status?: string; error?: string }>(
      `/api/staff/orders/${order.id}/handover`,
      { method: "POST" },
      [200, 409],
    );
    setBusyId(null);
    if (response.kind !== "ok") {
      setFailure(response);
      buzz(260);
      return;
    }
    if (response.status === 200) {
      setOrders((list) =>
        (list ?? []).map((o) =>
          o.id === order.id ? { ...o, status: "delivered" } : o,
        ),
      );
      setHandedOver((n) => n + 1);
      setNotice({ tone: "ok", text: t("done", { ref: order.ref }) });
      buzz(70);
      return;
    }
    const error = response.body.error;
    setNotice({
      tone: "bad",
      text:
        error === "already_handed_over"
          ? t("already")
          : error === "conflict"
            ? t("conflict")
            : t("cannot"),
    });
    if (error === "already_handed_over") {
      setOrders((list) =>
        (list ?? []).map((o) =>
          o.id === order.id ? { ...o, status: "delivered" } : o,
        ),
      );
    }
    buzz(260);
  }

  const statusLabel = (status: string) =>
    status === "delivered"
      ? t("statusDelivered")
      : status === "ready_for_pickup"
        ? t("statusReady")
        : t("statusWaiting");

  return (
    <StationShell
      title={t("title")}
      counter={tc("counter", { count: handedOver })}
    >
      <form
        onSubmit={(event) => void search(event)}
        className="rounded-lg border-2 border-black02 bg-offwhite p-4"
      >
        <label
          htmlFor="order-search"
          className="flex items-center gap-2 font-sans text-body-m font-bold text-black02"
        >
          <MagnifyingGlass size={20} weight="bold" aria-hidden />
          {t("searchLabel")}
        </label>
        <p id="order-search-hint" className="mt-1 text-caption text-black02/70">
          {t("intro")}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            id="order-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby="order-search-hint"
            autoComplete="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 rounded-md border-2 border-black02 bg-white px-3 py-2.5 text-body-m text-black02"
          />
          <button
            type="submit"
            disabled={tooShort || loading}
            className="shrink-0 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_3px_0_0_var(--color-black02)] active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none motion-reduce:transform-none"
          >
            <MagnifyingGlass
              size={20}
              weight="bold"
              aria-label={t("searchLabel")}
            />
          </button>
        </div>
      </form>

      <div aria-live="assertive" aria-atomic="true">
        {failure && (
          <FailurePanel
            failure={failure}
            onRetry={() => void search()}
            onNext={() => setFailure(null)}
          />
        )}
        {notice && (
          <p
            className={`rounded-md border-2 border-black02 px-4 py-3 font-sans text-body-m font-bold text-black02 ${
              notice.tone === "ok" ? "bg-success-pastel" : "bg-danger-pastel"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      {orders && orders.length === 0 && (
        <p className="text-body-m text-black02/75">{t("empty")}</p>
      )}

      {orders && orders.length > 0 && (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => {
            const done = order.status === "delivered";
            return (
              <li
                key={order.id}
                className={`rounded-lg border-2 border-black02 p-4 shadow-[0_4px_0_0_var(--color-black02)] ${
                  done ? "bg-offwhite" : "bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-mono text-body-m font-bold text-black02">
                    <Package size={20} weight="duotone" aria-hidden />#
                    {order.ref}
                  </span>
                  <span
                    className={`rounded-pill border-2 border-black02 px-3 py-1 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02 ${
                      done ? "bg-success-pastel" : "bg-primary"
                    }`}
                  >
                    {statusLabel(order.status)}
                  </span>
                </div>
                <p className="mt-2 text-body-l font-bold text-black02">
                  {order.buyerName ?? t("buyerUnknown")}
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-body-m text-black02">
                  {order.items.map((item, i) => (
                    <li key={i}>
                      <span className="font-bold">{item.quantity} ×</span>{" "}
                      {typeof item.name === "string"
                        ? item.name
                        : (item.name?.[locale] ?? "—")}
                      {item.variant?.size && (
                        <span className="text-black02/70">
                          {" "}
                          · {t("size", { size: item.variant.size })}
                        </span>
                      )}
                      {item.variant?.color && (
                        <span className="text-black02/70">
                          {" "}
                          · {t("color", { color: item.variant.color })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {!done && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void handOver(order)}
                    className={`${ACTION} mt-4 bg-primary`}
                  >
                    {t("handOver")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </StationShell>
  );
}
