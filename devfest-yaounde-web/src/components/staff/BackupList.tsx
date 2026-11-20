"use client";

import {
  ArrowsClockwise,
  CheckCircle,
  MagnifyingGlass,
  Trash,
  WarningCircle,
  WifiSlash,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  clearBackup,
  readBackup,
  syncBackup,
  type SyncOutcome,
} from "@/lib/backup-store";
import { searchBackup, type StoredBackup } from "@/lib/staff/backup-list";

/**
 * The offline backup list screen (ADR 0090): search the roster this phone
 * saved, with or without a connection. It is READ-ONLY and says so: it shows
 * who was in at the moment the list was made, never live state.
 */
export function BackupList() {
  const t = useTranslations("staff.backup");
  const locale = useLocale() === "en" ? "en-GB" : "fr-FR";
  const [stored, setStored] = useState<StoredBackup | null | undefined>(
    undefined,
  );
  const [online, setOnline] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<SyncOutcome | null>(null);

  useEffect(() => {
    // Read the phone's storage after mount (it does not exist on the server),
    // one tick later so it is not a synchronous state change inside the effect.
    const first = window.setTimeout(() => {
      setStored(readBackup());
      setOnline(navigator.onLine);
    }, 0);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Top up straight away when there is a connection.
    if (navigator.onLine) void refresh();
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  async function refresh() {
    setBusy(true);
    const outcome = await syncBackup();
    setBusy(false);
    setNote(outcome);
    setStored(outcome.ok ? outcome.stored : readBackup());
  }

  const hits = useMemo(
    () => (stored ? searchBackup(stored.list, query) : null),
    [stored, query],
  );
  const time = (iso: string | number) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: "Africa/Douala",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  const money = (n: number) => `${new Intl.NumberFormat(locale).format(n)} XAF`;

  if (stored === undefined) {
    return <p className="text-body-m text-black02/70">{t("loading")}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="status"
        className={`flex items-start gap-3 rounded-lg border-2 border-black02 px-4 py-3 ${online ? "bg-offwhite" : "bg-primary"}`}
      >
        {online ? (
          <CheckCircle
            size={24}
            weight="duotone"
            aria-hidden
            className="mt-0.5 shrink-0"
          />
        ) : (
          <WifiSlash
            size={24}
            weight="duotone"
            aria-hidden
            className="mt-0.5 shrink-0"
          />
        )}
        <div className="min-w-0 text-body-m text-black02">
          <p className="font-bold">{online ? t("online") : t("offline")}</p>
          {stored ? (
            <p>
              {t("savedAt", { time: time(stored.savedAt) })}{" "}
              {t("counts", {
                tickets: stored.list.tickets.length,
                reservations: stored.list.reservations.length,
              })}
            </p>
          ) : (
            <p>{online ? t("none") : t("noneOffline")}</p>
          )}
        </div>
        {online && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3.5 py-1.5 font-sans text-caption font-bold text-black02 disabled:opacity-50"
          >
            <ArrowsClockwise size={16} weight="bold" aria-hidden />
            {busy ? t("refreshing") : t("refresh")}
          </button>
        )}
      </div>

      {note && !note.ok && (
        <p role="alert" className="flex gap-2 text-body-m text-black02">
          <WarningCircle
            size={20}
            weight="duotone"
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          {t(`fail.${note.reason}`)}
        </p>
      )}

      <p className="rounded-md border-2 border-black02/20 px-4 py-3 text-body-m text-black02/85">
        {t("notLive")}
      </p>

      {stored && (
        <>
          <label className="relative block">
            <span className="sr-only">{t("searchLabel")}</span>
            <MagnifyingGlass
              size={22}
              weight="bold"
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black02/60"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              autoComplete="off"
              autoCapitalize="off"
              className="w-full rounded-pill border-2 border-black02 bg-offwhite py-3.5 pl-12 pr-4 font-sans text-body-l text-black02 focus:outline-none"
            />
          </label>

          {hits && query.trim().length >= 2 && (
            <>
              {hits.tickets.length === 0 && hits.reservations.length === 0 && (
                <p className="text-body-m text-black02/75">{t("noMatch")}</p>
              )}
              {hits.tickets.length > 0 && (
                <section aria-label={t("tickets")}>
                  <h2 className="mb-2 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
                    {t("tickets")}
                  </h2>
                  <ul className="flex flex-col gap-3">
                    {hits.tickets.map((x) => {
                      const tier = stored.list.tiers[x.t];
                      return (
                        <li
                          key={x.c}
                          className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-3"
                        >
                          <p className="font-sans text-body-l font-bold text-black02">
                            {x.n}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="rounded-pill border-2 border-black02 px-2.5 py-0.5 font-mono text-mono-tag font-bold uppercase text-black02">
                              {tier?.name ?? x.t}
                            </span>
                            <span className="font-mono text-body-m text-black02/80">
                              {x.c}
                            </span>
                          </p>
                          <p className="mt-1.5 text-body-m text-black02">
                            {x.i ? t("wasIn") : t("notYet")}
                            {x.f === "r" && ` · ${t("refunded")}`}
                            {x.f === "p" && ` · ${t("refundOpen")}`}
                            {tier && !tier.paid && ` · ${t("freePass")}`}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              {hits.reservations.length > 0 && (
                <section aria-label={t("reservations")}>
                  <h2 className="mb-2 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
                    {t("reservations")}
                  </h2>
                  <ul className="flex flex-col gap-3">
                    {hits.reservations.map((x) => (
                      <li
                        key={x.r}
                        className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-3"
                      >
                        <p className="font-sans text-body-l font-bold text-black02">
                          {x.n}{" "}
                          <span className="font-mono text-body-m font-normal text-black02/75">
                            {x.r}
                          </span>
                        </p>
                        <p className="mt-1 text-body-m text-black02">
                          {x.s === "cancelled"
                            ? t("resCancelled")
                            : x.s === "cash_received"
                              ? t("resPaid", { total: money(x.x) })
                              : t("resOwed", { total: money(x.x) })}
                          {x.i && ` · ${t("wasIn")}`}
                        </p>
                        {x.l.length > 0 && (
                          <p className="mt-1 text-body-m text-black02/80">
                            {x.l.join(" · ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <p className="text-caption text-black02/65">{t("freeNote")}</p>
          <button
            type="button"
            onClick={() => {
              clearBackup();
              setStored(null);
              setQuery("");
            }}
            className="flex w-fit items-center gap-2 rounded-pill border-2 border-black02/40 px-4 py-2 font-sans text-caption font-bold text-black02/80"
          >
            <Trash size={16} weight="bold" aria-hidden />
            {t("clear")}
          </button>
        </>
      )}
    </div>
  );
}
