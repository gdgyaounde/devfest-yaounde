"use client";

import { Check, ShoppingBag } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import {
  useDisplayPrice,
  useSalesPhase,
} from "@/components/global/SalesPhaseProvider";
import { MAX_LINE_QTY, useCart } from "@/lib/use-cart";
import { ProductImage } from "./ProductImage";
import { BUYABLE, StatusPill } from "./StatusPill";
import type { Product, ProductStatus } from "@/data/types";

/**
 * One product's detail, rendered inside the right-hand drawer on `/shop`
 * (PAGES.md §8).
 *
 * It has no back link or page heading of its own: the drawer supplies the
 * close affordance, and the grid it opens over never went away.
 *
 * ON "OUT OF STOCK VARIANTS": the brief asks for individually disabled
 * variants, and the backend cannot support it — the catalog carries ONE
 * `status` per product and no per-variant inventory (GAPS.md G12). So
 * availability is shown and enforced at the product level, honestly, rather
 * than greying out individual sizes on a guess. When a product is unbuyable
 * the whole control set is disabled and says why, which is the truthful
 * version of the same intent.
 */
export function ProductDetail({ product }: { product: Product }) {
  const t = useTranslations("pages.shop");
  const tr = useTranslations("reservations");
  const phase = useSalesPhase();
  const displayPrice = useDisplayPrice();
  const locale = useLocale() as "fr" | "en";
  const { add } = useCart();

  const sizes = product.variants?.size ?? [];
  const colors = product.variants?.color ?? [];
  const [size, setSize] = useState<string>("");
  const [color, setColor] = useState<string>(colors[0] ?? "");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [image, setImage] = useState(0);

  const buyable = BUYABLE.includes(product.status as ProductStatus);
  // The server rejects a sized product without a size (`invalid_variant`),
  // so the button waits for one rather than letting the order bounce.
  const needsSize = sizes.length > 0;
  const ready = buyable && (!needsSize || size !== "");

  const money = (v: number) =>
    new Intl.NumberFormat(locale === "fr" ? "fr-CM" : "en-CM").format(v);

  return (
    <div className="p-6 sm:p-8">
      <div className="flex flex-col gap-8">
        <div>
          <div className="overflow-hidden rounded-lg border-2 border-black02 bg-pastel">
            <ProductImage
              src={product.images[image]}
              alt={product.name[locale]}
              priority
              className="aspect-square w-full object-cover"
            />
          </div>
          {product.images.length > 1 && (
            <ul className="mt-4 flex flex-wrap gap-3">
              {product.images.map((src, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setImage(i)}
                    aria-label={t("viewImage", { n: i + 1 })}
                    aria-pressed={i === image}
                    className={`h-20 w-20 overflow-hidden rounded-md border-2 ${
                      i === image ? "border-black02" : "border-black02/30"
                    }`}
                  >
                    <ProductImage
                      src={src}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <StatusPill
            status={product.status as ProductStatus}
            label={t(`status.${product.status}`)}
          />
          <h2 className="mt-5 font-sans text-display-l font-bold leading-tight text-black02">
            {product.name[locale]}
          </h2>
          <p className="mt-4 font-mono text-heading-m font-bold text-black02">
            {money(displayPrice(product.priceXAF, product.venuePriceXAF))} XAF
          </p>
          <p className="mt-5 max-w-prose text-body-l text-black02/80">
            {product.description[locale]}
          </p>

          {sizes.length > 0 && (
            <div className="mt-8">
              <p className="text-body-m font-bold text-black02">{t("size")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!buyable}
                    onClick={() => setSize(s)}
                    aria-pressed={size === s}
                    className={`rounded-pill border-2 border-black02 px-4 py-2 font-mono text-mono-tag font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      size === s
                        ? "bg-primary text-black02"
                        : "bg-transparent text-black02/70 hover:bg-pastel"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {colors.length > 0 && (
            <div className="mt-6">
              <p className="text-body-m font-bold text-black02">
                {t("colour")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={!buyable}
                    onClick={() => setColor(c)}
                    aria-pressed={color === c}
                    className={`rounded-pill border-2 border-black02 px-4 py-2 font-sans text-body-m font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      color === c
                        ? "bg-primary text-black02"
                        : "bg-transparent text-black02/70 hover:bg-pastel"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {buyable ? (
            <>
              <div className="mt-8 flex items-center gap-4">
                <p className="text-body-m font-bold text-black02">
                  {t("quantity")}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label={t("decrease")}
                    className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 text-black02 hover:bg-pastel disabled:opacity-30"
                  >
                    −
                  </button>
                  <span
                    aria-live="polite"
                    className="w-8 text-center font-mono text-heading-m font-bold text-black02"
                  >
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((q) => Math.min(MAX_LINE_QTY, q + 1))
                    }
                    disabled={quantity >= MAX_LINE_QTY}
                    aria-label={t("increase")}
                    className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 text-black02 hover:bg-pastel disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-8">
                <Button
                  size="md"
                  disabled={!ready || phase === "door"}
                  onClick={() => {
                    add({
                      productId: product.id,
                      quantity,
                      ...(size || color
                        ? {
                            variant: {
                              ...(size ? { size } : {}),
                              ...(color ? { color } : {}),
                            },
                          }
                        : {}),
                    });
                    setAdded(true);
                    window.setTimeout(() => setAdded(false), 2400);
                  }}
                >
                  {added ? (
                    <>
                      <Check size={18} weight="bold" />
                      {t("addedToBag")}
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={18} weight="bold" />
                      {phase === "selling"
                        ? t("addToBag")
                        : phase === "reserving"
                          ? tr("addToReservation")
                          : tr("doorCta")}
                    </>
                  )}
                </Button>
              </div>
              {needsSize && !size && (
                <p className="mt-3 text-body-m text-black02/70">
                  {t("pickSizeFirst")}
                </p>
              )}
              {added && (
                <p role="status" className="mt-4 text-body-m text-black02/80">
                  {t("addedHint")}{" "}
                  <Link
                    href={phase === "selling" ? "/shop/cart" : "/reserve"}
                    className="font-bold underline decoration-2 underline-offset-4"
                  >
                    {phase === "selling" ? t("viewBag") : tr("viewReservation")}
                  </Link>
                </p>
              )}
            </>
          ) : (
            <div className="mt-8 rounded-lg border-2 border-black02 bg-pastel p-5">
              <p className="text-body-m font-bold text-black02">
                {t(`unbuyable.${product.status}`)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
