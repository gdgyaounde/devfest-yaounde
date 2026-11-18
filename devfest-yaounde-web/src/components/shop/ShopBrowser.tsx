"use client";

import { MagnifyingGlass, ShoppingBag } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterGroup } from "@/components/ui/FilterGroup";
import { FilterLayout } from "@/components/ui/FilterLayout";
import { Reveal } from "@/components/ui/Reveal";
import { useCart } from "@/lib/use-cart";
import { Modal } from "@/components/ui/Modal";
import {
  useDisplayPrice,
  useSalesPhase,
} from "@/components/global/SalesPhaseProvider";
import { ProductDetail } from "./ProductDetail";
import { ProductImage } from "./ProductImage";
import { BUYABLE, StatusPill } from "./StatusPill";
import type { Product, ProductStatus } from "@/data/types";

/**
 * `/shop` — the catalog (PAGES.md §8).
 *
 * FILTERED BY STATUS, NOT CATEGORY. The brief asked for a category filter and
 * the backend's product model has no `category` field (GAPS.md G11) — so
 * rather than inventing categories and filtering on data the server does not
 * have, this filters on `status`, which is real and is what actually changes
 * what someone can do. Search covers the name and description.
 *
 * Evergreen framing: the shop runs before, during and after the event, so
 * nothing here assumes the event is still upcoming.
 */
export function ShopBrowser({
  products,
  initialProductId = null,
}: {
  products: Product[];
  /** Set when arriving directly on /shop/[product] — opens with the drawer up. */
  initialProductId?: string | null;
}) {
  const t = useTranslations("pages.shop");
  const tr = useTranslations("reservations");
  const phase = useSalesPhase();
  const displayPrice = useDisplayPrice();
  const tc = useTranslations("common.filters");
  const locale = useLocale() as "fr" | "en";
  const { count } = useCart();

  /*
   * DETAIL IS A DRAWER OVER THE GRID, and the URL still moves with it.
   *
   * Opening a product pushes /shop/{id} with `history.pushState` rather than
   * a router navigation: the grid, its filters and its scroll position all
   * stay exactly as they were, which is the entire reason for a drawer. The
   * URL is nonetheless real and server-rendered — see the route — so it can
   * be shared, bookmarked and indexed.
   *
   * `popstate` closes the drawer, so the browser Back button does what it
   * looks like it should rather than leaving the page.
   */
  const [openId, setOpenId] = useState<string | null>(initialProductId);

  const openProduct = useCallback(
    (id: string) => {
      setOpenId(id);
      window.history.pushState(null, "", `/${locale}/shop/${id}`);
    },
    [locale],
  );

  const closeProduct = useCallback(() => {
    setOpenId(null);
    window.history.pushState(null, "", `/${locale}/shop`);
  }, [locale]);

  useEffect(() => {
    function onPopState() {
      const match = window.location.pathname.match(/\/shop\/([^/]+)$/);
      setOpenId(match && match[1] !== "cart" ? match[1] : null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openProductData = products.find((p) => p.id === openId) ?? null;

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const statuses = useMemo(
    () => [...new Set(products.map((p) => p.status))].sort(),
    [products],
  );

  const q = query.trim().toLowerCase();
  const visible = products
    .filter((p) => !status || p.status === status)
    .filter(
      (p) =>
        !q ||
        p.name[locale].toLowerCase().includes(q) ||
        p.description[locale].toLowerCase().includes(q),
    );

  const activeCount = (q ? 1 : 0) + (status ? 1 : 0);

  const filters = (
    <>
      <div className="relative">
        <MagnifyingGlass
          size={18}
          weight="bold"
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black02/65"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="w-full rounded-pill border-2 border-black02 bg-offwhite py-2.5 pl-11 pr-4 text-body-m text-black02 placeholder:text-black02/45"
        />
      </div>
      <FilterGroup
        label={t("availability")}
        selected={status}
        onSelect={setStatus}
        options={[
          { value: null, label: t("allItems") },
          ...statuses.map((s) => ({ value: s, label: t(`status.${s}`) })),
        ]}
      />
    </>
  );

  return (
    <FilterLayout
      filters={filters}
      activeCount={activeCount}
      onClearAll={() => {
        setQuery("");
        setStatus(null);
      }}
      toolbar={
        phase === "door" ? undefined : (
          <a
            href={`/${locale}/${phase === "selling" ? "shop/cart" : "reserve"}`}
            className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none"
          >
            <ShoppingBag size={18} weight="bold" aria-hidden />
            {phase === "selling" ? t("bag") : tr("myReservation")}
            {count > 0 && (
              <span className="rounded-pill bg-offwhite px-2 py-0.5 font-mono text-mono-tag">
                {count}
              </span>
            )}
          </a>
        )
      }
    >
      <p className="mb-8 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
        {t("results", { count: visible.length })}
      </p>

      {visible.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-black02/30 px-7 py-16 text-center text-body-l text-black02/70">
          {t("noResults")}
        </p>
      ) : (
        /* Columns follow available width, not the viewport, so the grid
           reflows when the filter panel pushes (see [data-card-grid]). */
        <div
          data-card-grid
          style={{ ["--card-min" as string]: "18rem" }}
          className="grid gap-8"
        >
          {visible.map((product, i) => (
            /* `h-full` down the whole chain — Reveal, button, body — so every
                card stretches to the tallest in its row, with the price
                pinned to the bottom edge (below). Cards used to keep their
                own height (`items-start`), so a one-line description and a
                two-line one made a ragged row. */
            <Reveal key={product.id} index={i % 3} className="h-full">
              {/*
                A button, not a link: it opens a drawer rather than navigating.
                The URL is still updated, so sharing and Back both work — but
                rendering an <a> for something that does not navigate would
                mislead assistive tech and offer a broken "open in new tab".
              */}
              <button
                type="button"
                onClick={() => openProduct(product.id)}
                aria-haspopup="dialog"
                className="group flex h-full w-full flex-col overflow-hidden rounded-lg border-2 border-black02 bg-offwhite text-left shadow-[0_6px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-1 motion-reduce:transform-none"
              >
                <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-pastel">
                  <ProductImage
                    src={product.images[0]}
                    alt={product.name[locale]}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-4 top-4">
                    <StatusPill
                      status={product.status as ProductStatus}
                      label={t(`status.${product.status}`)}
                    />
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="font-sans text-heading-m font-bold leading-tight text-black02">
                    {product.name[locale]}
                  </p>
                  <p className="mt-2 line-clamp-2 text-body-m text-black02/70">
                    {product.description[locale]}
                  </p>
                  <p className="mt-auto pt-4 font-mono text-body-l font-bold text-black02">
                    {new Intl.NumberFormat(
                      locale === "fr" ? "fr-CM" : "en-CM",
                    ).format(
                      displayPrice(product.priceXAF, product.venuePriceXAF),
                    )}{" "}
                    XAF
                  </p>
                  {!BUYABLE.includes(product.status as ProductStatus) && (
                    <p className="mt-2 text-caption text-black02/65">
                      {t(`unbuyable.${product.status}`)}
                    </p>
                  )}
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      )}
      {/* ---- Product detail, in a right-hand drawer over the grid ---- */}
      <Modal
        open={openProductData !== null}
        onClose={closeProduct}
        variant="drawer-right"
        closeLabel={tc("close")}
      >
        {openProductData && <ProductDetail product={openProductData} />}
      </Modal>
    </FilterLayout>
  );
}
