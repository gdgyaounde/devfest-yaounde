"use client";

import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  Prohibit,
  Warning,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { entitlementIcon } from "@/lib/entitlement-icons";
import { CheckoutSteps } from "@/components/checkout/CheckoutSteps";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { PaymentStep } from "@/components/checkout/PaymentStep";
import { Badge } from "@/components/ui/Badge";
import { SwagPreview } from "./SwagPreview";

import { Button } from "@/components/ui/Button";
import {
  CheckoutError,
  checkoutTickets,
  isDiscountFailure,
  nextStepAfterCheckout,
  type AttendeeInput,
} from "@/lib/checkout-client";
import { useDiscount } from "@/components/checkout/use-discount";
import { signInWithGoogle, useSession } from "@/lib/use-session";
import {
  useDisplayPrice,
  useSalesPhase,
} from "@/components/global/SalesPhaseProvider";
import type { Product, TicketTier } from "@/data/types";

const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
/** The server caps an order at 10 attendees; stop them at the same number. */
const MAX_TICKETS = 10;

/**
 * Three steps, not four. The discount code moved into the order summary as an
 * inline "add a code" affordance: it is optional, most people do not have
 * one, and a whole step asking about something most people skip is a step
 * that mostly gets clicked through.
 */
type Step = "select" | "details" | "payment";
const STEPS: Step[] = ["select", "details", "payment"];

interface AttendeeDraft {
  tierId: string;
  name: string;
  email: string;
  /**
   * Collected so a buyer can identify someone they are buying for. NOTE: the
   * server has no per-attendee phone field, so this is not sent — see
   * docs/backend/GAPS.md G7. It is kept in the form because removing it would
   * lose the buyer's own record of who a ticket is for.
   */
  phone: string;
  apparelSize: string;
  /** "This one's mine" — prefills the form AND is recorded (ADR 0025). */
  isSelf: boolean;
}

export function TicketCheckout({
  tiers,
  swagProducts,
  bevyUrl,
}: {
  tiers: TicketTier[];
  /**
   * Every published product some tier references, resolved server-side
   * (ADR 0054). Only the referenced ones, not the whole catalog.
   */
  swagProducts: Product[];
  bevyUrl: string;
}) {
  const t = useTranslations("pages.tickets");
  const te = useTranslations("errors.checkout");
  const locale = useLocale();
  const { profile, loading: sessionLoading } = useSession();

  const onSale = useMemo(() => tiers.filter((tier) => tier.onSale), [tiers]);

  /*
   * Past the sales cutoff (ADR 0072) every PAID tier is closed — the same
   * locked card as "Sold out", with its own label — and the flow is pinned to
   * the tier list, so nobody fills in attendee details for an order the
   * server will refuse. The free RSVP card is untouched: it lives on Bevy.
   */
  const salesOpen = useSalesPhase() === "selling";
  const displayPrice = useDisplayPrice();

  /*
   * Tier id -> the products it bundles, in the order the admin arranged
   * them. Built once rather than per tier card, and ids that no longer
   * resolve (product deleted or unpublished since) are simply skipped —
   * a dangling reference must never blank out a tier's whole preview.
   */
  const swagByProductId = useMemo(
    () => new Map(swagProducts.map((product) => [product.id, product])),
    [swagProducts],
  );
  function swagFor(tier: TicketTier): Product[] {
    return (tier.swagProductIds ?? [])
      .map((id) => swagByProductId.get(id))
      .filter((product): product is Product => product !== undefined);
  }
  /*
   * The free tier is NOT sold here. Its RSVP is delegated to the community
   * platform, which already enforces one free RSVP per person — so it has no
   * quantity selector, never enters the basket, and never touches sign-in or
   * payment. Everything below therefore works on `paidTiers` only.
   */
  const externalTiers = useMemo(
    () => onSale.filter((tier) => tier.rsvpExternal),
    [onSale],
  );
  const paidTiers = useMemo(
    () => onSale.filter((tier) => !tier.rsvpExternal),
    [onSale],
  );

  const [chosenStep, setStep] = useState<Step>("select");
  const step: Step = salesOpen ? chosenStep : "select";
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [attendees, setAttendees] = useState<AttendeeDraft[]>([]);

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);
  const [invalidIndex, setInvalidIndex] = useState<number | null>(null);

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const subtotal = paidTiers.reduce(
    (sum, tier) => sum + tier.priceXAF * (counts[tier.id] ?? 0),
    0,
  );
  /*
   * No `isFree` branch anywhere below: the only zero-price tier is handled
   * off-site, so a basket that reaches checkout always has a real total.
   */

  // The basket as the server prices it: tier ids and counts, no money. The
  // hook re-prices whenever this changes under an applied code, so the
  // deduction on screen always belongs to the basket on screen.
  const discount = useDiscount({
    kind: "tickets",
    tiers: paidTiers
      .filter((tier) => (counts[tier.id] ?? 0) > 0)
      .map((tier) => ({ tierId: tier.id, quantity: counts[tier.id] ?? 0 })),
  });

  const money = (value: number) =>
    new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM").format(value);

  function setCount(tierId: string, next: number) {
    const clamped = Math.max(0, Math.min(next, MAX_TICKETS));
    setCounts((prev) => {
      const updated = { ...prev, [tierId]: clamped };
      if (clamped === 0) delete updated[tierId];
      return updated;
    });
  }

  /**
   * The attendee LIST is the quantity — three Sonnet entries means three
   * Sonnet tickets. Building it from the counts here keeps that invariant in
   * one place instead of asking every later step to remember it.
   */
  function buildAttendees(): AttendeeDraft[] {
    const built: AttendeeDraft[] = [];
    for (const tier of paidTiers) {
      for (let i = 0; i < (counts[tier.id] ?? 0); i++) {
        // Carry over anything already typed for this slot.
        const existing = attendees.filter((a) => a.tierId === tier.id)[i];
        built.push(
          existing ?? {
            tierId: tier.id,
            name: "",
            email: "",
            phone: "",
            apparelSize: "",
            isSelf: false,
          },
        );
      }
    }
    // Prefill the first ticket from the signed-in profile.
    //
    // Someone who just signed in should not retype the name and address they
    // signed in with. Done HERE rather than in an effect: the list is built
    // when they reach this step, which is after sign-in, and syncing state
    // from an effect afterwards would cascade renders for no gain.
    //
    // Three rules keep it from being annoying: only EMPTY fields are filled,
    // no ticket is claimed if another already is, and everything — including
    // the checkbox — stays editable, because buying only for other people is
    // perfectly normal.
    if (profile && built.length > 0) {
      const someoneClaimed = built.some((a) => a.isSelf);
      built[0] = {
        ...built[0],
        name: built[0].name.trim()
          ? built[0].name
          : (profile.displayName ?? ""),
        email: built[0].email.trim() ? built[0].email : (profile.email ?? ""),
        isSelf: someoneClaimed ? built[0].isSelf : true,
      };
    }

    return built;
  }

  function tierOf(id: string) {
    return paidTiers.find((tier) => tier.id === id);
  }

  const detailsComplete = attendees.every((a) => {
    if (a.name.trim().length < 2 || !a.email.includes("@")) return false;
    if (tierOf(a.tierId)?.includesApparel && !a.apparelSize) return false;
    return true;
  });

  function goNext() {
    setError(null);
    if (step === "select") {
      setAttendees(buildAttendees());
      setStep("details");
      return;
    }
    const i = STEPS.indexOf(step);
    setStep(STEPS[Math.min(i + 1, STEPS.length - 1)]);
  }

  function goBack() {
    setError(null);
    const i = STEPS.indexOf(step);
    setStep(STEPS[Math.max(i - 1, 0)]);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    setInvalidIndex(null);
    try {
      const payload: AttendeeInput[] = attendees.map((a) => ({
        tierId: a.tierId,
        name: a.name.trim(),
        email: a.email.trim(),
        ...(a.apparelSize ? { apparelSize: a.apparelSize } : {}),
        ...(a.isSelf ? { isSelf: true } : {}),
      }));
      const result = await checkoutTickets({
        attendees: payload,
        // The pay button is disabled until the box is ticked, so reaching
        // here means it was. The server records when, and what wording.
        acceptedTerms: true,
        ...(discount.submittedCode
          ? { discountCode: discount.submittedCode }
          : {}),
        contact: {
          email: profile?.email ?? attendees[0]?.email ?? "",
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        },
        locale,
      });
      // A full navigation, not a router push: the paid branch leaves the app
      // entirely for PawaPay's hosted page.
      window.location.assign(nextStepAfterCheckout(result, locale));
    } catch (err) {
      const e =
        err instanceof CheckoutError
          ? err
          : new CheckoutError("server_error", 500);
      setError(e);
      // Point at the attendee that needs fixing rather than making them hunt.
      if (e.code === "apparel_size_required") {
        setInvalidIndex(
          attendees.findIndex(
            (a) => tierOf(a.tierId)?.includesApparel && !a.apparelSize,
          ),
        );
        setStep("details");
      }
      if (isDiscountFailure(e.code)) {
        // Accepted for a quote, refused at payment — a single-use code can be
        // spent by somebody else in between. Keep the basket, clear only the
        // code; the verdict lands on the summary card, where the field is.
        discount.reject(e.code);
      }
      if (
        e.code === "tier_sold_out" ||
        e.code === "tier_not_on_sale" ||
        e.code === "ticket_sales_closed"
      )
        setStep("select");
      setSubmitting(false);
    }
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
      <div>
        <CheckoutSteps
          steps={STEPS.map((k) => ({ key: k, label: k }))}
          current={stepIndex}
          label={(key) => t(`steps.${key}`)}
        />

        {/*
          Sign-in offered up front and OPTIONAL — it prefills the attendee
          details and is required only at payment. Asking at the start saves
          retyping; forcing it at the start loses people who just want to see
          the prices.
        */}
        {!sessionLoading && !profile && step !== "payment" && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border-2 border-black02 bg-offwhite px-5 py-4">
            <p className="text-body-m text-black02/80">{t("signInPrefill")}</p>
            <button
              type="button"
              onClick={() => signInWithGoogle(locale, `/${locale}/tickets`)}
              className="inline-flex shrink-0 items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)]"
            >
              {t("continueWithGoogle")}
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-8 flex items-start gap-3 rounded-lg border-2 border-danger bg-danger-pastel px-5 py-4"
          >
            <Warning
              size={20}
              weight="fill"
              className="mt-0.5 shrink-0 text-danger-ink"
            />
            <div>
              <p className="text-body-m font-bold text-black02">
                {te(error.code as never)}
              </p>
              {error.retryAfter != null && (
                <p className="mt-1 text-body-m text-black02/75">
                  {t("retryIn", { seconds: error.retryAfter })}
                </p>
              )}
            </div>
          </div>
        )}

        {step === "select" && (
          <div className="flex flex-col gap-6">
            {/*
              The free tier, handled entirely off-site. No quantity selector,
              because the community platform enforces one RSVP per person; no
              sign-in, because nothing is bought here. It leads the list since
              it is the cheapest way in.
            */}
            {externalTiers.map((tier) => (
              <article
                key={tier.id}
                className="rounded-lg border-2 border-black02 bg-pastel p-6 sm:p-7"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="primary" variant="outline">
                    {tier.name}
                  </Badge>
                  {tier.label?.[locale as "fr" | "en"] && (
                    <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                      {tier.label[locale as "fr" | "en"]}
                    </span>
                  )}
                </div>
                <p className="mt-4 font-sans text-display-l font-bold leading-none text-black02">
                  {t("free")}
                </p>
                <p className="mt-3 max-w-prose text-body-m text-black02/75">
                  {tier.description[locale as "fr" | "en"]}
                </p>
                <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {tier.perks.map((perk, i) => {
                    const PerkIcon = entitlementIcon(perk.icon);
                    return (
                      <li key={i} className="flex items-start gap-2.5">
                        <PerkIcon
                          size={16}
                          weight="bold"
                          className="mt-1 shrink-0 text-black02"
                        />
                        <span className="text-body-m text-black02/80">
                          {perk.label[locale as "fr" | "en"]}
                          {perk.note?.[locale as "fr" | "en"] && (
                            <span className="block text-caption text-black02/65">
                              {perk.note[locale as "fr" | "en"]}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {/* No swag preview on the free pass (ADR 0074): swag, food
                    and event identifiers are paid-pass perks, and showing
                    a "what's in the box" row here said the opposite. */}
                <a
                  href={bevyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-7 inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none"
                >
                  {t("rsvpFree")}
                  <ArrowSquareOut size={16} weight="bold" aria-hidden />
                </a>
                <p className="mt-3 text-caption text-black02/65">
                  {t("rsvpNote")}
                </p>
              </article>
            ))}

            {paidTiers.map((tier) => {
              const count = counts[tier.id] ?? 0;
              const soldOut = Boolean(tier.soldOut) || !salesOpen;
              return (
                <article
                  key={tier.id}
                  className={`rounded-lg border-2 p-6 transition-shadow sm:p-7 ${
                    soldOut
                      ? "border-dashed border-black02/40 bg-offwhite/60"
                      : "border-black02 bg-offwhite"
                  } ${
                    count > 0 && !soldOut
                      ? "shadow-[0_6px_0_0_var(--color-black02)]"
                      : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge tone="primary" variant="outline">
                          {tier.name}
                        </Badge>
                        {tier.label?.[locale as "fr" | "en"] && (
                          <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                            {tier.label[locale as "fr" | "en"]}
                          </span>
                        )}
                        {tier.includesApparel && (
                          <Badge tone="blue">{t("includesApparel")}</Badge>
                        )}
                        {soldOut && (
                          <span className="inline-flex items-center gap-1.5 rounded-pill border-2 border-black02/50 bg-offwhite px-3 py-1 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
                            <Prohibit size={14} weight="bold" aria-hidden />
                            {salesOpen ? t("soldOut") : t("salesClosed")}
                          </span>
                        )}
                      </div>
                      <p className="mt-4 font-sans text-display-l font-bold leading-none text-black02">
                        {tier.priceXAF === 0
                          ? t("free")
                          : `${money(
                              displayPrice(tier.priceXAF, tier.venuePriceXAF),
                            )} XAF`}
                      </p>
                      <p className="mt-3 max-w-prose text-body-m text-black02/75">
                        {tier.description[locale as "fr" | "en"]}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setCount(tier.id, count - 1)}
                        disabled={count === 0 || soldOut}
                        aria-label={t("removeOne", { tier: tier.name })}
                        className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 text-black02 transition-colors hover:bg-pastel disabled:opacity-30"
                      >
                        <Minus size={16} weight="bold" />
                      </button>
                      <span
                        aria-live="polite"
                        className="w-8 text-center font-mono text-heading-m font-bold text-black02"
                      >
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCount(tier.id, count + 1)}
                        disabled={total >= MAX_TICKETS || soldOut}
                        aria-label={t("addOne", { tier: tier.name })}
                        className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 text-black02 transition-colors hover:bg-pastel disabled:opacity-30"
                      >
                        <Plus size={16} weight="bold" />
                      </button>
                    </div>
                  </div>

                  <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {tier.perks.map((perk, i) => {
                      const PerkIcon = entitlementIcon(perk.icon);
                      return (
                        <li key={i} className="flex items-start gap-2.5">
                          <PerkIcon
                            size={16}
                            weight="bold"
                            className="mt-1 shrink-0 text-black02"
                          />
                          <span className="text-body-m text-black02/80">
                            {perk.label[locale as "fr" | "en"]}
                            {perk.note?.[locale as "fr" | "en"] && (
                              <span className="block text-caption text-black02/65">
                                {perk.note[locale as "fr" | "en"]}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <SwagPreview items={swagFor(tier)} />
                </article>
              );
            })}
            {total >= MAX_TICKETS && (
              <p className="text-body-m text-black02/70">
                {t("maxReached", { max: MAX_TICKETS })}
              </p>
            )}
          </div>
        )}

        {step === "details" && (
          <div className="flex flex-col gap-6">
            <p className="text-body-l text-black02/80">{t("detailsIntro")}</p>
            {attendees.map((a, i) => {
              const tier = tierOf(a.tierId);
              return (
                <fieldset
                  key={i}
                  className={`rounded-lg border-2 bg-offwhite p-6 ${
                    invalidIndex === i ? "border-danger" : "border-black02"
                  }`}
                >
                  <legend className="flex items-center gap-3 px-2">
                    <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02">
                      {t("ticketOfN", {
                        current: i + 1,
                        total: attendees.length,
                      })}
                    </span>
                    <Badge tone="primary" variant="outline">
                      {tier?.name}
                    </Badge>
                  </legend>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-body-m font-bold text-black02">
                        {t("attendeeName")}
                      </span>
                      <input
                        value={a.name}
                        onChange={(e) =>
                          setAttendees((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                        maxLength={80}
                        required
                        className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-2.5 text-body-m text-black02"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-body-m font-bold text-black02">
                        {t("attendeeEmail")}
                      </span>
                      <input
                        type="email"
                        value={a.email}
                        onChange={(e) =>
                          setAttendees((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, email: e.target.value } : x,
                            ),
                          )
                        }
                        required
                        className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-2.5 text-body-m text-black02"
                      />
                    </label>
                    {/*
                      Phone is collected so a buyer can identify who a ticket
                      is for, but it is NOT sent: the server has no
                      per-attendee phone field and requires the email
                      (GAPS.md G7). Labelled optional so nobody is misled into
                      thinking it replaces the email.
                    */}
                    <label className="flex flex-col gap-1.5">
                      <span className="text-body-m font-bold text-black02">
                        {t("attendeePhone")}
                      </span>
                      <input
                        value={a.phone}
                        onChange={(e) =>
                          setAttendees((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    phone: e.target.value.replace(
                                      /[^0-9]/g,
                                      "",
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                        inputMode="numeric"
                        placeholder="237690000000"
                        className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-2.5 font-mono text-body-m text-black02"
                      />
                    </label>
                  </div>

                  {/* Only tiers that actually include apparel ask for a size —
                      the server rejects the order without one. */}
                  {tier?.includesApparel && (
                    <div className="mt-4">
                      <p className="text-body-m font-bold text-black02">
                        {t("apparelSize")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {APPAREL_SIZES.map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() =>
                              setAttendees((prev) =>
                                prev.map((x, j) =>
                                  j === i ? { ...x, apparelSize: size } : x,
                                ),
                              )
                            }
                            aria-pressed={a.apparelSize === size}
                            className={`rounded-pill border-2 border-black02 px-4 py-2 font-mono text-mono-tag font-bold transition-colors ${
                              a.apparelSize === size
                                ? "bg-primary text-black02"
                                : "bg-transparent text-black02/70 hover:bg-pastel"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/*
                    Self-assignment, per ticket rather than only the first:
                    someone buying four tickets is often not the first name on
                    the list. Prefills from the account and stays editable.
                  */}
                  <label className="mt-4 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={a.isSelf}
                      onChange={(e) =>
                        setAttendees((prev) =>
                          prev.map((x, j) => {
                            if (j !== i) {
                              // Only one ticket can be "mine".
                              return e.target.checked
                                ? { ...x, isSelf: false }
                                : x;
                            }
                            if (!e.target.checked)
                              return { ...x, isSelf: false };
                            return {
                              ...x,
                              isSelf: true,
                              name: profile?.displayName ?? x.name,
                              email: profile?.email ?? x.email,
                            };
                          }),
                        )
                      }
                      className="h-5 w-5 shrink-0 rounded-sm border-2 border-black02 accent-[var(--color-primary)]"
                    />
                    <span className="text-body-m text-black02">
                      {t("thisIsMe")}
                    </span>
                  </label>
                </fieldset>
              );
            })}
          </div>
        )}

        {step === "payment" && (
          <PaymentStep
            phone={phone}
            setPhone={setPhone}
            acceptedTerms={acceptedTerms}
            setAcceptedTerms={setAcceptedTerms}
            profile={profile}
            sessionLoading={sessionLoading}
            signInNext={`/${locale}/tickets`}
            terms={{
              title: t("refundTitle"),
              body: t("refundBody"),
              ack: t("refundAck"),
              link: {
                href: `/${locale}/terms`,
                label: t("termsLink"),
              },
            }}
          />
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3">
          {step !== "select" && (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 px-5 py-2.5 font-sans text-body-m font-bold text-black02 transition-colors hover:bg-pastel"
            >
              <ArrowLeft size={16} weight="bold" />
              {t("back")}
            </button>
          )}
          {step !== "payment" ? (
            <Button
              size="md"
              onClick={goNext}
              disabled={
                !salesOpen ||
                (step === "select" && total === 0) ||
                (step === "details" && !detailsComplete)
              }
            >
              {t("next")}
              <ArrowRight size={16} weight="bold" />
            </Button>
          ) : (
            <Button
              size="md"
              onClick={submit}
              /* The refund acknowledgment GATES payment — money is involved,
                 and an unread policy is not consent. */
              disabled={submitting || !profile || !acceptedTerms}
            >
              {submitting ? t("working") : t("payNow")}
              <ArrowRight size={16} weight="bold" />
            </Button>
          )}
        </div>
      </div>

      {/* ---- Order summary, sticky through every step ---- */}
      {/*
       * A floating card pinned near the bottom of a phone, collapsed until
       * tapped.
       *
       * It was briefly stretched to the screen edges. Floating reads better:
       * it stays clearly a panel sitting OVER the page rather than a bar
       * welded to the bottom of it, and it keeps the rounded corners the rest
       * of the site uses. `bottom-4` is the gap that makes that legible.
       *
       * The summary collapses itself (see OrderSummary), so what is pinned is
       * a single bar carrying the total until someone asks for the detail.
       *
       * From `lg` it goes back to being a normal sticky column at the top.
       */}
      <aside className="sticky bottom-4 z-30 max-h-[70svh] overflow-y-auto lg:bottom-auto lg:top-40 lg:max-h-none lg:self-start lg:overflow-visible">
        <OrderSummary
          title={t("summary")}
          lines={paidTiers
            .filter((tier) => (counts[tier.id] ?? 0) > 0)
            .map((tier) => ({
              id: tier.id,
              label: tier.name,
              quantity: counts[tier.id] ?? 0,
              amount: tier.priceXAF * (counts[tier.id] ?? 0),
            }))}
          total={subtotal}
          emptyLabel={t("summaryEmpty")}
          note={t("totalNote")}
          discount={{
            ...discount,
            errorText: (code) => te(code as never),
          }}
        />
      </aside>
    </div>
  );
}
