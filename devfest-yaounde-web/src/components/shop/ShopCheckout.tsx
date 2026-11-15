"use client";

import {
  ArrowLeft,
  ArrowRight,
  Package,
  ShoppingBag,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { CheckoutSteps } from "@/components/checkout/CheckoutSteps";
import {
  OrderSummary,
  type SummaryLine,
} from "@/components/checkout/OrderSummary";
import { PaymentStep } from "@/components/checkout/PaymentStep";
import { ShopLateNotice } from "./ShopLateNotice";
import { Button } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import {
  CheckoutError,
  checkoutShop,
  isDiscountFailure,
  nextStepAfterCheckout,
} from "@/lib/checkout-client";
import { useDiscount } from "@/components/checkout/use-discount";
import { MAX_LINE_QTY, useCart } from "@/lib/use-cart";
import { useSession } from "@/lib/use-session";
import { ProductImage } from "./ProductImage";
import { BUYABLE } from "./StatusPill";
import type { Product, ProductStatus } from "@/data/types";

type Step = "bag" | "payment";
const STEPS = [
  { key: "bag", label: "bag" },
  { key: "payment", label: "payment" },
];

/**
 * `/shop/cart` — the bag and its checkout.
 *
 * THIS IS PART A'S CHECKOUT, not a second one. The step chrome, the sticky
 * order summary with the inline discount field, and the whole payment step —
 * Mobile Money only, the phone field, the refund acknowledgment that gates
 * the pay button — are the shared components under `components/checkout/`.
 * What differs is genuinely different: line items are products with variants
 * rather than attendees with names, so this file owns the bag editing and
 * nothing else.
 *
 * Fewer steps than tickets, deliberately: a bag needs no per-person details,
 * so inventing an equivalent middle step would be ceremony.
 */
export function ShopCheckout({
  products,
  lateNotice = null,
}: {
  products: Product[];
  /**
   * "Items ordered now may not be ready by event day" (ADR 0072), resolved
   * on the server. Shown above every step — bag AND payment — so it is in
   * view when the buyer ticks the consent line that repeats it.
   */
  lateNotice?: string | null;
}) {
  const t = useTranslations("pages.shop");
  const tt = useTranslations("pages.tickets");
  const te = useTranslations("errors.checkout");
  const locale = useLocale();
  const { profile, loading: sessionLoading } = useSession();
  const { lines, setQuantity, remove, clear, count } = useCart();

  // The bag as the server prices it: ids, counts and variants, no money. The
  // hook re-prices whenever it changes under an applied code, so the
  // deduction on screen always belongs to the bag on screen.
  const discount = useDiscount({
    kind: "shop",
    cart: lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      ...(line.variant ? { variant: line.variant } : {}),
    })),
  });

  const [step, setStep] = useState<Step>("bag");
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  const [phone, setPhone] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // A preference, not a commitment: the team still coordinates. Defaults to
  // pickup because that is what most people do at a one-city event.
  const [fulfilmentMethod, setFulfilmentMethod] = useState<
    "pickup" | "shipping"
  >("pickup");
  const [fulfilmentNote, setFulfilmentNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);

  const productOf = (id: string) => products.find((p) => p.id === id);
  const money = (v: number) =>
    new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM").format(v);

  const subtotal = lines.reduce((sum, line) => {
    const p = productOf(line.productId);
    return sum + (p ? p.priceXAF * line.quantity : 0);
  }, 0);

  /* A stale tab can hold something that has since sold out. The server
     refuses it either way; catching it here explains it before they pay. */
  const unbuyable = lines.filter((line) => {
    const p = productOf(line.productId);
    return !p || !BUYABLE.includes(p.status as ProductStatus);
  });

  const summaryLines: SummaryLine[] = lines.map((line, i) => {
    const p = productOf(line.productId);
    const variant = [line.variant?.size, line.variant?.color]
      .filter(Boolean)
      .join(" · ");
    return {
      id: `${line.productId}-${i}`,
      label: p?.name[locale as "fr" | "en"] ?? line.productId,
      sublabel: variant || undefined,
      quantity: line.quantity,
      amount: (p?.priceXAF ?? 0) * line.quantity,
    };
  });

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await checkoutShop({
        // Same gate as tickets; goods carry their own wording server-side.
        acceptedTerms: true,
        fulfilment: {
          method: fulfilmentMethod,
          ...(fulfilmentNote.trim() ? { note: fulfilmentNote.trim() } : {}),
        },
        cart: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          ...(line.variant ? { variant: line.variant } : {}),
        })),
        ...(discount.submittedCode
          ? { discountCode: discount.submittedCode }
          : {}),
        contact: {
          email: profile?.email ?? "",
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        },
        locale,
      });
      // Full navigation: the paid branch leaves the app for PawaPay.
      window.location.assign(nextStepAfterCheckout(result, locale));
    } catch (err) {
      const e =
        err instanceof CheckoutError
          ? err
          : new CheckoutError("server_error", 500);
      setError(e);
      if (isDiscountFailure(e.code)) {
        // Accepted for a quote, refused at payment — a single-use code can be
        // spent by somebody else in between. Keep the bag, clear the code.
        discount.reject(e.code);
      }
      if (e.code === "product_unavailable" || e.code === "unknown_product") {
        setStep("bag");
      }
      setSubmitting(false);
    }
  }

  if (count === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-black02/30 px-7 py-16 text-center">
        <ShoppingBag
          size={36}
          weight="bold"
          aria-hidden
          className="mx-auto text-black02/65"
        />
        <p className="mt-5 font-sans text-heading-m font-bold text-black02">
          {t("emptyBagTitle")}
        </p>
        <p className="mx-auto mt-3 max-w-sm text-body-m text-black02/70">
          {t("emptyBagBody")}
        </p>
        <div className="mt-7 flex justify-center">
          <Button href="/shop" size="md">
            {t("browseShop")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
      <div>
        <CheckoutSteps
          steps={STEPS}
          current={STEPS.findIndex((s) => s.key === step)}
          label={(key) => t(`steps.${key}`)}
        />

        <ShopLateNotice text={lateNotice} className="mb-8" />

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
                  {tt("retryIn", { seconds: error.retryAfter })}
                </p>
              )}
            </div>
          </div>
        )}

        {step === "bag" && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
              {t("bagCount", { count })}
            </p>
            {/*
              Emptying the bag is one click away and undoable by nobody, so it
              asks first — but in place, not in a modal. A dialog for "are you
              sure" over three t-shirts is heavier than the action deserves;
              swapping the button for its own confirmation is enough friction
              to stop a mis-tap, and "Keep it" is right there.
            */}
            {confirmingEmpty ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-m font-bold text-black02">
                  {t("emptyAllConfirm")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    clear();
                    setConfirmingEmpty(false);
                  }}
                  className="rounded-pill border-2 border-danger bg-danger-pastel px-4 py-1.5 font-sans text-body-m font-bold text-danger-ink"
                >
                  {t("emptyAllYes")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingEmpty(false)}
                  className="rounded-pill border-2 border-black02 px-4 py-1.5 font-sans text-body-m font-bold text-black02 hover:bg-pastel"
                >
                  {t("emptyAllCancel")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingEmpty(true)}
                className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 px-4 py-1.5 font-sans text-body-m font-bold text-black02 transition-colors hover:bg-danger-pastel hover:text-danger-ink"
              >
                <Trash size={16} weight="bold" aria-hidden />
                {t("emptyAll")}
              </button>
            )}
          </div>
        )}

        {step === "bag" && (
          <ul className="flex flex-col gap-5">
            {lines.map((line, i) => {
              const p = productOf(line.productId);
              const variant = [line.variant?.size, line.variant?.color]
                .filter(Boolean)
                .join(" · ");
              const gone = !p || !BUYABLE.includes(p.status as ProductStatus);
              return (
                <li
                  key={`${line.productId}-${i}`}
                  className={`flex flex-wrap items-center gap-5 rounded-lg border-2 bg-offwhite p-5 ${
                    gone ? "border-danger" : "border-black02"
                  }`}
                >
                  {p && (
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md border-2 border-black02 bg-pastel">
                      <ProductImage
                        src={p.images[0]}
                        alt={p.name[locale as "fr" | "en"]}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-heading-m font-bold text-black02">
                      {p?.name[locale as "fr" | "en"] ?? line.productId}
                    </p>
                    {variant && (
                      <p className="mt-1 font-mono text-mono-tag uppercase tracking-wide text-black02/65">
                        {variant}
                      </p>
                    )}
                    <p className="mt-2 font-mono text-body-m font-bold text-black02">
                      {money((p?.priceXAF ?? 0) * line.quantity)} XAF
                    </p>
                    {gone && (
                      <p className="mt-2 text-body-m font-bold text-danger-ink">
                        {t("lineUnavailable")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity(i, line.quantity - 1)}
                      aria-label={t("decrease")}
                      className="flex h-10 w-10 items-center justify-center rounded-pill border-2 border-black02 text-black02 hover:bg-pastel"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-mono text-body-l font-bold text-black02">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(i, line.quantity + 1)}
                      disabled={line.quantity >= MAX_LINE_QTY}
                      aria-label={t("increase")}
                      className="flex h-10 w-10 items-center justify-center rounded-pill border-2 border-black02 text-black02 hover:bg-pastel disabled:opacity-30"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={t("removeLine")}
                      className="flex h-10 w-10 items-center justify-center rounded-pill border-2 border-black02 text-black02 transition-colors hover:bg-danger-pastel hover:text-danger-ink"
                    >
                      <Trash size={16} weight="bold" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {step === "payment" && (
          <PaymentStep
            phone={phone}
            setPhone={setPhone}
            acceptedTerms={acceptedTerms}
            setAcceptedTerms={setAcceptedTerms}
            profile={profile}
            sessionLoading={sessionLoading}
            signInNext={`/${locale}/shop/cart`}
            terms={{
              title: t("returnsTitle"),
              body: t("returnsBody"),
              ack: t("returnsAck"),
            }}
            extra={
              /*
               * A real control again.
               *
               * This was a pickup-vs-delivery radio group, then an
               * informational line, because the schema had no field for it and
               * the choice was collected and discarded. Migration 0006 gives
               * it somewhere to go: `shopCheckoutSchema.fulfilment` is carried
               * onto the order under `requested`, where an organiser sees it
               * and their own edits sit beside it rather than on top.
               *
               * Still a PREFERENCE, not a shipping engine — no zones, no fees,
               * no windows (PAGES.md §11). The copy says the team follows up,
               * because it does.
               */
              <div className="rounded-lg border-2 border-black02 bg-offwhite p-5">
                <div className="flex items-start gap-3">
                  <Package
                    size={22}
                    weight="bold"
                    className="mt-0.5 shrink-0 text-black02"
                  />
                  <div>
                    <p className="text-body-m font-bold text-black02">
                      {t("fulfilmentTitle")}
                    </p>
                    <p className="mt-1 text-body-m text-black02/75">
                      {t("fulfilmentBody")}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(["pickup", "shipping"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setFulfilmentMethod(method)}
                      aria-pressed={fulfilmentMethod === method}
                      className={`rounded-pill border-2 border-black02 px-4 py-2 font-sans text-body-m font-bold transition-transform duration-200 ease-bouncy motion-reduce:transform-none ${
                        fulfilmentMethod === method
                          ? "bg-black02 text-offwhite"
                          : "bg-white text-black02 hover:-translate-y-0.5"
                      }`}
                    >
                      {method === "pickup"
                        ? t("fulfilmentPickup")
                        : t("fulfilmentShipping")}
                    </button>
                  ))}
                </div>

                <label className="mt-4 block">
                  <span className="text-body-s font-bold text-black02">
                    {t("fulfilmentNoteLabel")}
                  </span>
                  <input
                    type="text"
                    value={fulfilmentNote}
                    maxLength={300}
                    onChange={(e) => setFulfilmentNote(e.target.value)}
                    placeholder={t("fulfilmentNotePlaceholder")}
                    className="mt-1.5 w-full rounded-lg border-2 border-black02 bg-white px-4 py-2.5 font-sans text-body-m text-black02 placeholder:text-black02/40"
                  />
                </label>
              </div>
            }
          />
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3">
          {step === "payment" && (
            <button
              type="button"
              onClick={() => setStep("bag")}
              className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 px-5 py-2.5 font-sans text-body-m font-bold text-black02 transition-colors hover:bg-pastel"
            >
              <ArrowLeft size={16} weight="bold" />
              {tt("back")}
            </button>
          )}
          {step === "bag" ? (
            <Button
              size="md"
              onClick={() => setStep("payment")}
              disabled={unbuyable.length > 0}
            >
              {tt("next")}
              <ArrowRight size={16} weight="bold" />
            </Button>
          ) : (
            <Button
              size="md"
              onClick={submit}
              /* Same gate as tickets: the refund acknowledgment blocks the
                 pay button, and the shared component is why it cannot drift. */
              disabled={submitting || !profile || !acceptedTerms}
            >
              {submitting ? tt("working") : tt("payNow")}
              <ArrowRight size={16} weight="bold" />
            </Button>
          )}
        </div>
      </div>

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
          title={tt("summary")}
          lines={summaryLines}
          total={subtotal}
          emptyLabel={tt("summaryEmpty")}
          note={tt("totalNote")}
          discount={{
            ...discount,
            errorText: (code) => te(code as never),
          }}
        >
          <p className="mt-5 text-caption text-black02/65">
            <Link
              href="/shop"
              className="underline decoration-2 underline-offset-4"
            >
              {t("keepShopping")}
            </Link>
          </p>
        </OrderSummary>
      </aside>
    </div>
  );
}
