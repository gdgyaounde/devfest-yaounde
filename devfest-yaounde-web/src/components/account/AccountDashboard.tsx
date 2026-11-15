"use client";

import {
  Check,
  LockSimple,
  Package,
  PencilSimple,
  SignOut,
  Ticket as TicketIcon,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { orderRef } from "@/lib/staff/rules";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BadgeCode } from "@/components/tickets/BadgeCode";
import { Toast } from "@/components/ui/Toast";
import { TicketEditor } from "@/components/account/TicketEditor";
import { mailtoHref } from "@/lib/mailto";
import { CHAPTER_EMAIL } from "@/lib/site-config";
import { useBeforeInstant } from "@/lib/use-before-instant";
import { signInWithGoogle, signOut, useSession } from "@/lib/use-session";

interface LocalizedString {
  fr: string;
  en: string;
}

/**
 * A ticket as `/api/account/tickets` returns it — the row plus the two things
 * the row cannot answer on its own: what the tier actually is, and what was
 * actually paid. Both resolved server-side, so this page and the receipt
 * email describe a ticket identically.
 */
interface Ticket {
  id: string;
  attendeeName: string;
  attendeeEmail: string;
  apparelSize: string | null;
  badgeCode: string;
  checkedInAt: string | null;
  createdAt: string;
  isSelf: boolean | null;
  /** Why it cannot be edited right now, or null (ADR 0075). */
  lock: "edits_closed" | "checked_in" | "refund_pending" | null;
  tier: {
    id: string;
    name: string;
    label: LocalizedString | null;
    description: LocalizedString | null;
    perks: LocalizedString[];
    includesApparel: boolean;
  };
  unitAmount: number | null;
  order: {
    depositId: string;
    currency: string;
    discountCode: string | null;
    discountAmount: number;
    /** The 1.5% transaction fee, already folded into `chargedAmount`. */
    feeAmount: number;
    chargedAmount: number;
    paidAt: string;
  } | null;
}

interface OrderItem {
  product_id: string;
  variant: Record<string, string> | null;
  quantity: number;
  unit_amount: number;
  /** jsonb: the bilingual name at purchase time (a bare string on old rows). */
  name_snapshot: { fr: string; en: string } | string;
}

interface Order {
  id: string;
  status: string;
  total_amount: number;
  currency: string;
  fulfilment: string | null;
  created_at: string;
  order_items: OrderItem[];
}

type Tab = "tickets" | "orders";

export function AccountDashboard({
  editsCloseAt,
  editsOpenAtRender,
  editsDeadline,
}: {
  /** The edits cutoff (ADR 0075) and what was true when the page rendered. */
  editsCloseAt: string | null;
  editsOpenAtRender: boolean;
  /** Formatted in Yaoundé time on the server; null = no cutoff. */
  editsDeadline: { date: string; short: string; time: string } | null;
}) {
  const t = useTranslations("pages.account");
  const te = useTranslations("pages.account.ticketEdit");
  // Flips at the minute, so an open tab cannot keep offering "Edit".
  const editsOpen = useBeforeInstant(editsCloseAt, editsOpenAtRender);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  const locale = useLocale();
  const router = useRouter();
  const { profile, loading } = useSession();

  const [tab, setTab] = useState<Tab>("tickets");
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      // Both endpoints are scoped to the signed-in person by the database
      // itself — there is no id to pass, and no way to ask for someone else's.
      const [tRes, oRes] = await Promise.allSettled([
        fetch("/api/account/tickets", { cache: "no-store" }),
        fetch("/api/account/orders", { cache: "no-store" }),
      ]);
      if (cancelled) return;
      if (tRes.status === "fulfilled" && tRes.value.ok) {
        setTickets((await tRes.value.json()).tickets ?? []);
      } else setTickets([]);
      if (oRes.status === "fulfilled" && oRes.value.ok) {
        setOrders((await oRes.value.json()).orders ?? []);
      } else setOrders([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const money = (value: number) =>
    new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM").format(value);

  if (loading) {
    return <p className="text-body-l text-black02/70">{t("loading")}</p>;
  }

  if (!profile) {
    return (
      <div className="max-w-md rounded-lg border-2 border-black02 bg-offwhite p-7">
        <h2 className="font-sans text-heading-l font-bold text-black02">
          {t("signedOutTitle")}
        </h2>
        <p className="mt-3 text-body-m text-black02/80">{t("signedOutBody")}</p>
        <button
          type="button"
          onClick={() => signInWithGoogle(locale, `/${locale}/account`)}
          className="mt-6 inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)]"
        >
          {t("continueWithGoogle")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
            {t("signedInAs")}
          </p>
          <p className="mt-1 font-sans text-heading-m font-bold text-black02">
            {profile.displayName ?? profile.email}
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await signOut(locale);
            // refresh() as well as push(): signing out changes what the
            // server renders, and a push alone would leave stale markup.
            router.push(`/${locale}`);
            router.refresh();
          }}
          className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 px-5 py-2.5 font-sans text-body-m font-bold text-black02 transition-colors hover:bg-pastel"
        >
          <SignOut size={16} weight="bold" />
          {t("signOut")}
        </button>
      </div>

      <div
        role="tablist"
        aria-label={t("title")}
        className="mt-10 flex overflow-hidden rounded-pill border-2 border-black02"
      >
        {(
          [
            ["tickets", TicketIcon, t("myTickets")],
            ["orders", Package, t("myOrders")],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 font-mono text-mono-tag font-bold uppercase tracking-wide transition-colors duration-200 ${
              tab === key
                ? "bg-black02 text-offwhite"
                : "bg-transparent text-black02 hover:bg-pastel"
            }`}
          >
            <Icon size={16} weight="bold" />
            {label}
          </button>
        ))}
      </div>

      {tab === "tickets" && (
        <div className="mt-8">
          {tickets === null ? (
            <p className="text-body-m text-black02/70">{t("loading")}</p>
          ) : tickets.length === 0 ? (
            <EmptyState
              title={t("noTicketsTitle")}
              body={t("noTicketsBody")}
              href="/tickets"
              cta={t("browseTickets")}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="rounded-lg border-2 border-black02 bg-offwhite p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary" variant="outline">
                        {ticket.tier.name}
                      </Badge>
                      {ticket.isSelf && <Badge tone="blue">{t("yours")}</Badge>}
                    </div>
                    {ticket.checkedInAt ? (
                      <Badge tone="success">{t("checkedIn")}</Badge>
                    ) : (
                      <Badge tone="blue">{t("valid")}</Badge>
                    )}
                  </div>

                  {ticket.tier.label && (
                    <p className="mt-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                      {ticket.tier.label[locale === "en" ? "en" : "fr"]}
                    </p>
                  )}

                  <p className="mt-2 font-sans text-heading-m font-bold text-black02">
                    {ticket.attendeeName}
                  </p>
                  <p className="mt-1 break-words text-body-m text-black02/70">
                    {ticket.attendeeEmail}
                  </p>
                  {ticket.apparelSize && (
                    <p className="mt-1 text-body-m text-black02/70">
                      {t("size", { size: ticket.apparelSize })}
                    </p>
                  )}

                  {/* Self-edit (ADR 0075): name + size until the cutoff. */}
                  {(() => {
                    // The server's verdict, plus the live clock: a tab left
                    // open across the cutoff stops offering "Edit".
                    const effective =
                      ticket.lock ?? (editsOpen ? null : "edits_closed");
                    if (effective === null) {
                      return (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setEditingId(ticket.id)}
                            className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-4 py-2 font-sans text-body-m font-bold text-black02 shadow-[0_3px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none"
                          >
                            <PencilSimple size={16} weight="bold" aria-hidden />
                            {te("edit")}
                          </button>
                          {editsDeadline && (
                            <span className="text-caption text-black02/70">
                              {te("editHint", {
                                date: editsDeadline.short,
                                time: editsDeadline.time,
                              })}
                            </span>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div className="mt-4 flex items-start gap-2 rounded-lg border-2 border-black02/20 bg-pastel/60 px-3.5 py-2.5">
                        <LockSimple
                          size={16}
                          weight="bold"
                          aria-hidden
                          className="mt-1 shrink-0 text-black02"
                        />
                        <p className="text-body-m text-black02/80">
                          {effective === "checked_in"
                            ? te("lockedCheckedIn")
                            : effective === "refund_pending"
                              ? te("lockedRefund")
                              : te("lockedClosed", {
                                  date: editsDeadline?.short ?? "",
                                })}{" "}
                          {effective !== "checked_in" && (
                            <a
                              href={mailtoHref(CHAPTER_EMAIL, {
                                subject: te("contactSubject"),
                              })}
                              className="font-bold underline decoration-2 underline-offset-4"
                            >
                              {te("contact")}
                            </a>
                          )}
                        </p>
                      </div>
                    );
                  })()}

                  {/* What the tier includes. The whole point of buying one
                      tier over another, and until now it lived only on the
                      sales page — where you cannot look it up afterwards. */}
                  {ticket.tier.perks.length > 0 && (
                    <div className="mt-5">
                      <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                        {t("included")}
                      </p>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {ticket.tier.perks.map((perk, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-body-m text-black02/80"
                          >
                            <Check
                              size={16}
                              weight="bold"
                              aria-hidden
                              className="mt-1 shrink-0"
                            />
                            <span>{perk[locale === "en" ? "en" : "fr"]}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* What it cost. `unitAmount` is this ticket's BASE price
                      (fee-free, matching every other per-line price on the
                      site); the discount, the transaction fee and the total
                      belong to the whole ORDER, so they are labelled as such
                      rather than implying this one ticket carried them. */}
                  {ticket.order && (
                    <div className="mt-5 border-t-2 border-black02/15 pt-4">
                      {ticket.unitAmount !== null && (
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-body-m text-black02/70">
                            {t("pricePaid")}
                          </span>
                          <span className="font-mono text-body-m font-bold text-black02">
                            {money(ticket.unitAmount)} {ticket.order.currency}
                          </span>
                        </div>
                      )}
                      {ticket.order.discountAmount > 0 && (
                        <div className="mt-1.5 flex items-baseline justify-between gap-4">
                          <span className="text-body-m text-black02/70">
                            {t("orderDiscount", {
                              code: ticket.order.discountCode ?? "",
                            })}
                          </span>
                          <span className="font-mono text-body-m text-black02/70">
                            -{money(ticket.order.discountAmount)}
                          </span>
                        </div>
                      )}
                      {ticket.order.feeAmount > 0 && (
                        <div className="mt-1.5 flex items-baseline justify-between gap-4">
                          <span className="text-body-m text-black02/70">
                            {t("orderFee")}
                          </span>
                          <span className="font-mono text-body-m text-black02/70">
                            {money(ticket.order.feeAmount)}
                          </span>
                        </div>
                      )}
                      <div className="mt-1.5 flex items-baseline justify-between gap-4">
                        <span className="text-body-m text-black02/70">
                          {t("orderTotal")}
                        </span>
                        <span className="font-mono text-body-m text-black02/70">
                          {money(ticket.order.chargedAmount)}{" "}
                          {ticket.order.currency}
                        </span>
                      </div>
                      <p className="mt-3 text-caption text-black02/65">
                        {t("purchasedOn", {
                          date: new Date(
                            ticket.order.paidAt,
                          ).toLocaleDateString(
                            locale === "en" ? "en-GB" : "fr-FR",
                            { day: "numeric", month: "long", year: "numeric" },
                          ),
                        })}
                      </p>
                      <p className="mt-1 font-mono text-caption text-black02/65">
                        {t("reference", {
                          ref: ticket.order.depositId.slice(0, 8),
                        })}
                      </p>
                    </div>
                  )}

                  <div className="mt-5">
                    <BadgeCode
                      code={ticket.badgeCode}
                      label={t("badgeLabel")}
                      size={132}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "orders" && (
        <div className="mt-8">
          {orders === null ? (
            <p className="text-body-m text-black02/70">{t("loading")}</p>
          ) : orders.length === 0 ? (
            <EmptyState
              title={t("noOrdersTitle")}
              body={t("noOrdersBody")}
              href="/shop"
              cta={t("browseShop")}
            />
          ) : (
            <ul className="flex flex-col gap-5">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="rounded-lg border-2 border-black02 bg-offwhite p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-2">
                      {/* The number the merch table searches by (ADR 0079). */}
                      <span className="font-mono text-body-m font-bold text-black02">
                        {t("orderRef", { ref: orderRef(order.id) })}
                      </span>
                      <Badge tone="primary" variant="outline">
                        {order.status}
                      </Badge>
                    </span>
                    <span className="font-mono text-body-m font-bold text-black02">
                      {money(order.total_amount)} {order.currency}
                    </span>
                  </div>
                  <ul className="mt-4 flex flex-col gap-2">
                    {order.order_items.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-baseline justify-between gap-4"
                      >
                        {/* name_snapshot, not a catalog lookup: a past order
                            keeps reading correctly after the catalog changes. */}
                        <span className="text-body-m text-black02">
                          {typeof item.name_snapshot === "string"
                            ? item.name_snapshot
                            : item.name_snapshot[
                                locale === "en" ? "en" : "fr"
                              ]}{" "}
                          × {item.quantity}
                        </span>
                        <span className="font-mono text-body-m text-black02/70">
                          {money(item.unit_amount * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(() => {
        const editing = tickets?.find((x) => x.id === editingId);
        if (!editing) return null;
        return (
          <TicketEditor
            key={editing.id}
            open
            ticket={{
              id: editing.id,
              attendeeName: editing.attendeeName,
              apparelSize: editing.apparelSize,
              includesApparel: editing.tier.includesApparel,
            }}
            deadline={
              editsDeadline
                ? { date: editsDeadline.date, time: editsDeadline.time }
                : null
            }
            onClose={() => setEditingId(null)}
            onSaved={(next) => {
              setTickets(
                (prev) =>
                  prev?.map((x) =>
                    x.id === editing.id ? { ...x, ...next } : x,
                  ) ?? prev,
              );
              setEditingId(null);
              setToast(true);
            }}
          />
        );
      })()}

      {toast && (
        <Toast onDismiss={() => setToast(false)} dismissLabel={te("dismiss")}>
          {te("saved")}
        </Toast>
      )}
    </div>
  );
}

function EmptyState({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-lg border-2 border-dashed border-black02/30 px-7 py-14 text-center">
      <p className="font-sans text-heading-m font-bold text-black02">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-body-m text-black02/70">
        {body}
      </p>
      <div className="mt-6 flex justify-center">
        <Button href={href} size="md">
          {cta}
        </Button>
      </div>
    </div>
  );
}
