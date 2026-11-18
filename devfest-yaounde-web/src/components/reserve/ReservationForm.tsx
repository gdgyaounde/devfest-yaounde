"use client";

import {
  CalendarCheck,
  CheckCircle,
  Minus,
  Plus,
  Prohibit,
  Storefront,
  Warning,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useSalesPhase } from "@/components/global/SalesPhaseProvider";
import { Link } from "@/i18n/navigation";
import { MAX_ACTIVE_RESERVATIONS, MAX_TICKETS } from "@/lib/reservations/rules";
import { APPAREL_SIZES } from "@/lib/tickets/self-edit";
import { MAX_LINE_QTY, useCart } from "@/lib/use-cart";
import { signInWithGoogle, useSession } from "@/lib/use-session";

export interface ReservableTier {
  id: string;
  name: string;
  label: string;
  description: string;
  /** BASE price — cash at the venue has no online fee (ADR 0084). */
  priceXAF: number;
  includesApparel: boolean;
  soldOut: boolean;
  /** Names of what's in the box, already in the page's language. */
  box: string[];
}

export interface ReservableProduct {
  id: string;
  name: string;
  priceXAF: number;
}

type When = { date: string; time: string } | null;

interface Done {
  reference: string;
  totalXaf: number;
  venue: string;
}

const INPUT =
  "w-full rounded-md border-2 border-black02 bg-white px-3 py-2.5 text-body-m text-black02 placeholder:text-black02/40";
const LABEL = "font-sans text-body-m font-bold text-black02";
const CARD = "rounded-lg border-2 border-black02 bg-offwhite p-5 sm:p-6";
const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-pill border-2 border-black02 bg-primary px-7 py-3.5 font-sans text-body-l font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none motion-reduce:transform-none";

/**
 * Reserve tickets and shop items; pay cash at the venue (ADR 0084).
 *
 * Nothing is charged here. The phase decides what the page offers:
 *   selling   — reservations open when payments close (a pointer to /tickets);
 *   reserving — the form;
 *   door      — reservations are over; cash at the venue.
 *
 * The server prices everything from the catalog at BASE price; the totals on
 * this screen are a courtesy, not what is recorded. Sign-in is required (it is
 * what makes a reservation yours to look up and cancel), and a reservation is
 * the unit people quote at the door through its reference.
 */
export function ReservationForm({
  tiers,
  products,
  reservationsDeadline,
  salesClose,
  eventDate,
  venue,
}: {
  tiers: ReservableTier[];
  products: ReservableProduct[];
  reservationsDeadline: When;
  salesClose: When;
  eventDate: string;
  venue: string;
}) {
  const t = useTranslations("pages.reserve");
  const te = useTranslations("errors.reservations");
  const locale = useLocale();
  const phase = useSalesPhase();
  const { profile, loading: sessionLoading } = useSession();
  const cart = useCart();

  const money = (value: number) =>
    `${new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM").format(value)} XAF`;

  // Untouched fields follow the profile once it arrives (no setState in an
  // effect): `null` means "the person has not typed here".
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [attendeeNames, setAttendeeNames] = useState<Record<string, string>>(
    {},
  );
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const contactName = name ?? profile?.displayName ?? "";
  const contactEmail = email ?? profile?.email ?? "";

  const productById = new Map(products.map((p) => [p.id, p]));
  const lines = cart.lines.filter((line) => productById.has(line.productId));

  const ticketCount = tiers.reduce((n, tier) => n + (counts[tier.id] ?? 0), 0);
  const ticketsTotal = tiers.reduce(
    (n, tier) => n + (counts[tier.id] ?? 0) * tier.priceXAF,
    0,
  );
  const itemsTotal = lines.reduce(
    (n, line) =>
      n + line.quantity * (productById.get(line.productId)?.priceXAF ?? 0),
    0,
  );
  const total = ticketsTotal + itemsTotal;

  function setCount(tierId: string, next: number) {
    const room = MAX_TICKETS - (ticketCount - (counts[tierId] ?? 0));
    setCounts((c) => ({ ...c, [tierId]: Math.max(0, Math.min(next, room)) }));
  }

  // The ticket rows, in tier order: one per ticket asked for.
  const ticketRows = tiers.flatMap((tier) =>
    Array.from({ length: counts[tier.id] ?? 0 }, (_, i) => ({
      key: `${tier.id}:${i}`,
      tier,
      n: i + 1,
    })),
  );

  const phoneDigits = phone.replace(/\D/g, "").length;
  const ready =
    accepted &&
    contactName.trim().length >= 2 &&
    phoneDigits >= 8 &&
    phoneDigits <= 15 &&
    ticketCount + lines.length > 0 &&
    ticketRows.every(
      (row) =>
        (attendeeNames[row.key] ?? "").trim().length >= 2 &&
        (!row.tier.includesApparel || Boolean(sizes[row.key])),
    );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact: {
            name: contactName.trim(),
            phone: phone.trim(),
            email: contactEmail.trim(),
          },
          tickets: ticketRows.map((row) => ({
            tierId: row.tier.id,
            name: (attendeeNames[row.key] ?? "").trim(),
            ...(row.tier.includesApparel && sizes[row.key]
              ? { apparelSize: sizes[row.key] }
              : {}),
          })),
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            ...(line.variant ? { variant: line.variant } : {}),
          })),
          acceptedCash: true,
          locale: locale === "en" ? "en" : "fr",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        reference?: string;
        totalXaf?: number;
        error?: string;
      };
      if (!response.ok || !body.reference) {
        setError(body.error ?? "server_error");
        return;
      }
      // The items now live in the reservation; the device bag is done.
      cart.clear();
      setDone({
        reference: body.reference,
        totalXaf: body.totalXaf ?? total,
        venue,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ not open ---

  if (phase === "selling") {
    return (
      <section className={CARD}>
        <h2 className="font-sans text-heading-l font-bold text-black02">
          {t("notOpenTitle", { time: salesClose?.time ?? "" })}
        </h2>
        <p className="mt-2 max-w-prose text-body-m text-black02/80">
          {t("notOpenBody")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/tickets" className={PRIMARY}>
            {t("payNow")}
          </Link>
        </div>
      </section>
    );
  }

  if (phase === "door") {
    return (
      <section className={CARD}>
        <h2 className="flex items-center gap-3 font-sans text-heading-l font-bold text-black02">
          <Prohibit size={32} weight="duotone" aria-hidden />
          {t("closedTitle")}
        </h2>
        <p className="mt-2 max-w-prose text-body-m text-black02/80">
          {t("closedBody", { venue, date: eventDate })}
        </p>
      </section>
    );
  }

  // ---------------------------------------------------------------- done ---

  if (done) {
    return (
      <section
        aria-live="polite"
        className="rounded-lg border-2 border-black02 bg-success-pastel p-6 shadow-[0_6px_0_0_var(--color-black02)] sm:p-8"
      >
        <p className="flex items-center gap-3 font-sans text-heading-l font-bold text-black02">
          <CheckCircle size={36} weight="fill" aria-hidden />
          {t("doneTitle")}
        </p>
        <p className="mt-4 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
          {t("reference")}
        </p>
        <p className="font-mono text-display-l font-bold tracking-wider text-black02">
          {done.reference}
        </p>
        <p className="mt-4 max-w-prose text-body-l font-bold text-black02">
          {t("doneCash", { total: money(done.totalXaf), venue: done.venue })}
        </p>
        <ul className="mt-4 max-w-prose list-disc space-y-1.5 pl-5 text-body-m text-black02/85">
          <li>{t("doneKeep")}</li>
          <li>
            {t("doneDeadline", {
              date: reservationsDeadline?.date ?? "",
              time: reservationsDeadline?.time ?? "",
            })}
          </li>
          <li>{t("doneNoEmail")}</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/account" className={PRIMARY}>
            {t("myReservations")}
          </Link>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------- sign-in ---

  if (!sessionLoading && !profile) {
    return (
      <section className={CARD}>
        <h2 className="font-sans text-heading-l font-bold text-black02">
          {t("signInTitle")}
        </h2>
        <p className="mt-2 max-w-prose text-body-m text-black02/80">
          {t("signInBody")}
        </p>
        <div className="mt-5">
          <button
            type="button"
            onClick={() => signInWithGoogle(locale, `/${locale}/reserve`)}
            className={PRIMARY}
          >
            {t("continueWithGoogle")}
          </button>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------- form ---

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) void submit();
      }}
    >
      <p className="flex items-start gap-3 rounded-lg border-2 border-black02 bg-primary px-5 py-4 text-body-m font-bold text-black02">
        <CalendarCheck
          size={24}
          weight="duotone"
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span>
          {t("banner", {
            date: reservationsDeadline?.date ?? "",
            time: reservationsDeadline?.time ?? "",
          })}
        </span>
      </p>

      {/* 1 — tickets */}
      <section className={CARD} aria-labelledby="res-tickets">
        <h2
          id="res-tickets"
          className="font-sans text-heading-m font-bold text-black02"
        >
          {t("ticketsTitle")}
        </h2>
        <p className="mt-1 text-body-m text-black02/70">
          {t("ticketsHint", { max: MAX_TICKETS })}
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {tiers.map((tier) => {
            const n = counts[tier.id] ?? 0;
            return (
              <li
                key={tier.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-md border-2 border-black02/20 bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02">
                    {tier.name}
                    {tier.label && (
                      <span className="ml-2 font-sans normal-case text-black02/65">
                        {tier.label}
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-body-m font-bold text-black02">
                    {money(tier.priceXAF)}
                  </p>
                  {tier.box.length > 0 && (
                    <p className="mt-1 text-caption text-black02/65">
                      {t("inTheBox", { items: tier.box.join(", ") })}
                    </p>
                  )}
                  {tier.soldOut && (
                    <p className="mt-1 text-caption font-bold text-danger-ink">
                      {t("soldOut")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t("less", { name: tier.name })}
                    disabled={n <= 0}
                    onClick={() => setCount(tier.id, n - 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 hover:bg-pastel disabled:opacity-30"
                  >
                    <Minus size={16} weight="bold" aria-hidden />
                  </button>
                  <span
                    aria-live="polite"
                    className="w-8 text-center font-mono text-heading-m font-bold"
                  >
                    {n}
                  </span>
                  <button
                    type="button"
                    aria-label={t("more", { name: tier.name })}
                    disabled={tier.soldOut || ticketCount >= MAX_TICKETS}
                    onClick={() => setCount(tier.id, n + 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 hover:bg-pastel disabled:opacity-30"
                  >
                    <Plus size={16} weight="bold" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {ticketRows.length > 0 && (
          <div className="mt-6 flex flex-col gap-4">
            <h3 className={LABEL}>{t("attendeesTitle")}</h3>
            {ticketRows.map((row) => (
              <div
                key={row.key}
                className="grid gap-3 rounded-md border-2 border-black02/20 bg-white p-4 sm:grid-cols-[1fr_auto]"
              >
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
                    {t("ticketN", { tier: row.tier.name, n: row.n })}
                  </span>
                  <input
                    value={attendeeNames[row.key] ?? ""}
                    onChange={(e) =>
                      setAttendeeNames((s) => ({
                        ...s,
                        [row.key]: e.target.value,
                      }))
                    }
                    maxLength={80}
                    autoComplete="off"
                    placeholder={t("attendeeName")}
                    className={INPUT}
                  />
                </label>
                {row.tier.includesApparel && (
                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
                      {t("size")}
                    </span>
                    <select
                      value={sizes[row.key] ?? ""}
                      onChange={(e) =>
                        setSizes((s) => ({ ...s, [row.key]: e.target.value }))
                      }
                      className={INPUT}
                    >
                      <option value="">{t("pickSize")}</option>
                      {APPAREL_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2 — shop items, from the device bag */}
      <section className={CARD} aria-labelledby="res-items">
        <h2
          id="res-items"
          className="font-sans text-heading-m font-bold text-black02"
        >
          {t("itemsTitle")}
        </h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-body-m text-black02/70">
            {t("itemsEmpty")}{" "}
            <Link
              href="/shop"
              className="font-bold underline decoration-2 underline-offset-4"
            >
              {t("browseShop")}
            </Link>
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {lines.map((line) => {
              const product = productById.get(line.productId)!;
              const index = cart.lines.indexOf(line);
              return (
                <li
                  key={`${line.productId}:${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-black02/20 bg-white px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body-m font-bold text-black02">
                      {product.name}
                    </p>
                    <p className="text-caption text-black02/65">
                      {[line.variant?.size, line.variant?.color]
                        .filter(Boolean)
                        .join(" · ")}
                      {line.variant ? " · " : ""}
                      {money(product.priceXAF)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={t("less", { name: product.name })}
                      onClick={() => cart.setQuantity(index, line.quantity - 1)}
                      className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 hover:bg-pastel"
                    >
                      <Minus size={16} weight="bold" aria-hidden />
                    </button>
                    <span className="w-8 text-center font-mono text-heading-m font-bold">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={t("more", { name: product.name })}
                      disabled={line.quantity >= MAX_LINE_QTY}
                      onClick={() => cart.setQuantity(index, line.quantity + 1)}
                      className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 hover:bg-pastel disabled:opacity-30"
                    >
                      <Plus size={16} weight="bold" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {lines.length > 0 && (
          <p className="mt-3 text-caption text-black02/65">
            <Storefront
              size={14}
              weight="bold"
              aria-hidden
              className="mr-1 inline"
            />
            {t("itemsHint")}
          </p>
        )}
      </section>

      {/* 3 — who */}
      <section className={CARD} aria-labelledby="res-contact">
        <h2
          id="res-contact"
          className="font-sans text-heading-m font-bold text-black02"
        >
          {t("contactTitle")}
        </h2>
        <p className="mt-1 text-body-m text-black02/70">{t("contactHint")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={LABEL}>{t("yourName")}</span>
            <input
              value={contactName}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>{t("phone")}</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              maxLength={24}
              placeholder="+237 6 00 00 00 00"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>
              {t("email")}{" "}
              <span className="font-normal text-black02/60">
                {t("optional")}
              </span>
            </span>
            <input
              value={contactEmail}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              maxLength={254}
              className={INPUT}
            />
          </label>
        </div>
      </section>

      {/* 4 — total, cash, submit */}
      <section className={CARD}>
        <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
          {t("totalLabel")}
        </p>
        <p className="font-mono text-display-l font-bold text-black02">
          {money(total)}
        </p>
        <p className="mt-1 text-body-m text-black02/75">
          {t("totalHint", { venue })}
        </p>

        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-black"
          />
          <span className="text-body-m text-black02">
            {t("acceptCash", { venue })}
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="mt-5 flex items-start gap-3 rounded-lg border-2 border-danger bg-danger-pastel px-4 py-3 text-body-m text-black02"
          >
            <Warning
              size={20}
              weight="bold"
              aria-hidden
              className="mt-0.5 shrink-0"
            />
            {(te as (key: string, values?: Record<string, number>) => string)(
              error,
              { max: MAX_ACTIVE_RESERVATIONS },
            )}
          </p>
        )}

        <div className="mt-6">
          <button type="submit" disabled={!ready || busy} className={PRIMARY}>
            <CalendarCheck size={22} weight="bold" aria-hidden />
            {busy ? t("reserving") : t("reserve")}
          </button>
        </div>
      </section>
    </form>
  );
}
