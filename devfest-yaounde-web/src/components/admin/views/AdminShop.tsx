"use client";

import { useState } from "react";
import { Link as LinkIcon, Minus, Plus } from "@phosphor-icons/react";
import type {
  ApparelSize,
  Product,
  ProductStatus,
  TicketTier,
} from "@/data/types";
import { slugify } from "@/lib/admin/form-helpers";
import type { AdminData } from "@/lib/admin/shape";
import { EntityCrud } from "../forms/EntityCrud";
import { PriceReadout } from "../forms/PriceReadout";
import {
  ChipInput,
  Field,
  FilterBar,
  LocalizedInput,
  Segmented,
  TextInput,
  Toggle,
} from "../forms/fields";
import { MultiImageUpload } from "../forms/MultiImageUpload";
import { InfoBanner } from "./shared";

const EMPTY = { fr: "", en: "" };
const SIZES: ApparelSize[] = ["XS", "S", "M", "L", "XL", "XXL"];

const STATUSES: { value: ProductStatus; label: string }[] = [
  { value: "in-stock", label: "In stock" },
  { value: "pre-order", label: "Pre-order" },
  { value: "venue-only", label: "Venue only" },
  { value: "sold-out", label: "Sold out" },
];

export function AdminShop({
  rows,
  data,
  tiers,
  initialEditId,
}: {
  rows: Product[];
  data: AdminData;
  /** For the linkage chip: which tier a swag-created product belongs to. */
  tiers: TicketTier[];
  initialEditId?: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [visibility, setVisibility] = useState("all");

  const needle = query.trim().toLowerCase();
  function matches(row: Product): boolean {
    if (status !== "all" && row.status !== status) return false;
    if (visibility === "hidden" && row.published !== false) return false;
    if (visibility === "live" && row.published === false) return false;
    if (visibility === "ticket-only" && !row.ticketOnly) return false;
    if (!needle) return true;
    return (
      row.id.toLowerCase().includes(needle) ||
      row.name.fr.toLowerCase().includes(needle) ||
      row.name.en.toLowerCase().includes(needle) ||
      row.description.fr.toLowerCase().includes(needle) ||
      row.description.en.toLowerCase().includes(needle)
    );
  }

  const hiddenCount = rows.filter((r) => r.published === false).length;
  const ticketOnlyCount = rows.filter((r) => r.ticketOnly).length;

  /**
   * Which tiers bundle this product (ADR 0054).
   *
   * The reverse of the reference the tier holds. A product knows nothing
   * about tiers — that would be the ownership the reference model exists to
   * avoid — so this is derived on read, from the tiers themselves.
   */
  function tiersBundling(productId: string): string[] {
    return tiers
      .filter((tier) => (tier.swagProductIds ?? []).includes(productId))
      .map((tier) => tier.name);
  }

  function ordersFor(productId: string): number {
    return data.orders.rows.filter((o) =>
      o.items.some((i) => i.productId === productId),
    ).length;
  }

  return (
    <div className="flex flex-col gap-5">
      <InfoBanner>
        No category field — filtering is by status and search instead (see
        `docs/backend/GAPS.md` G11). Categories were deferred again as packages
        whose shape isn&rsquo;t settled yet; adding a real one is a separate
        decision, not a quiet filter-bar addition.
      </InfoBanner>

      <EntityCrud<Product>
        collection="products"
        rows={rows}
        addLabel="Add a product"
        emptyLabel="No products yet."
        initialEditId={initialEditId}
        toolbar={
          <FilterBar
            query={query}
            onQuery={setQuery}
            placeholder="Search name, description or id"
            chips={[
              {
                label: "Status",
                value: status,
                onChange: setStatus,
                options: [
                  { value: "all", label: "All" },
                  ...STATUSES.map((s) => ({ value: s.value, label: s.label })),
                ],
              },
              {
                label: "Visibility",
                value: visibility,
                onChange: setVisibility,
                options: [
                  { value: "all", label: "All" },
                  { value: "live", label: "Published" },
                  {
                    value: "hidden",
                    label: `Hidden${hiddenCount ? ` (${hiddenCount})` : ""}`,
                  },
                  {
                    value: "ticket-only",
                    label: `Ticket-only${ticketOnlyCount ? ` (${ticketOnlyCount})` : ""}`,
                  },
                ],
              },
            ]}
          />
        }
        filter={matches}
        rowToggle={{
          value: (row) => row.published !== false,
          apply: (row, next) => ({ ...row, published: next }),
          label: (on) => (on ? "Hide" : "Publish"),
          saved: (on) =>
            on
              ? "Live in the shop."
              : "Hidden from the shop — still here, and still in any tier that bundles it.",
        }}
        sections={{ on: "Published", off: "Hidden" }}
        describeImpact={(product) => {
          const orderCount = ordersFor(product.id);
          if (orderCount > 0) {
            return {
              blocked: true,
              message: `Linked to ${orderCount} existing order${orderCount === 1 ? "" : "s"}. Mark it sold-out or unpublish it instead of deleting — deleting would orphan those orders' line items.`,
            };
          }
          const bundled = tiersBundling(product.id);
          if (bundled.length > 0) {
            return {
              blocked: false,
              message: `Bundled with the ${bundled.join(", ")} tier${bundled.length === 1 ? "" : "s"}. Deleting it removes the listing AND drops it from ${bundled.length === 1 ? "that tier's" : "those tiers'"} swag preview — the tier itself is unaffected otherwise.`,
            };
          }
          return null;
        }}
        blank={() => ({
          id: "",
          name: { ...EMPTY },
          description: { ...EMPTY },
          priceXAF: 0,
          images: [],
          status: "pre-order" as ProductStatus,
          published: true,
        })}
        renderRow={(row) => (
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black02/15 bg-pastel">
              {row.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.images[0]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-mono text-caption text-black02/65">
                  —
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-sans text-body-m font-bold text-black02">
                {row.name.en || row.name.fr || row.id}
              </p>
              {row.ticketOnly ? (
                // No price to show: it is never sold on its own.
                <p className="font-mono text-caption font-bold text-black02">
                  Ticket-only — not sold in the shop
                </p>
              ) : (
                <PriceReadout base={row.priceXAF} />
              )}
              <p className="truncate text-caption text-black02/65">
                {!row.ticketOnly &&
                  STATUSES.find((s) => s.value === row.status)?.label}
                {row.published === false && " · Hidden"}
                {tiersBundling(row.id).length > 0 &&
                  ` · In ${tiersBundling(row.id).join(", ")}`}
              </p>
            </div>
          </div>
        )}
        renderForm={(draft, patch) => {
          // A ticket-only product is never priced or listed, so it needs
          // neither a price nor a picture to go live (the ticket card shows a
          // placeholder for a missing image).
          const canPublish =
            draft.ticketOnly || (draft.priceXAF > 0 && draft.images.length > 0);
          return (
            <>
              <Field label="Name">
                <LocalizedInput
                  value={draft.name}
                  onChange={(name) =>
                    patch(
                      draft.id
                        ? { name }
                        : { name, id: slugify(name.en || name.fr) },
                    )
                  }
                />
              </Field>

              <Field label="Id">
                <TextInput value={draft.id} onChange={(id) => patch({ id })} />
              </Field>

              {tiersBundling(draft.id).length > 0 && (
                <p className="inline-flex w-fit items-center gap-1.5 rounded-pill border border-black02/25 bg-pastel px-3 py-1.5 font-mono text-caption font-bold text-black02">
                  <LinkIcon size={12} weight="bold" aria-hidden />
                  Bundled with {tiersBundling(draft.id).join(", ")}
                </p>
              )}

              <Field label="Description">
                <LocalizedInput
                  value={draft.description}
                  onChange={(description) => patch({ description })}
                  multiline
                />
              </Field>

              <Field
                label="Base price (XAF)"
                hint={
                  draft.ticketOnly
                    ? undefined
                    : "Enter the base price, without the fee. The displayed price is worked out from it automatically, everywhere this product is shown."
                }
              >
                <TextInput
                  type="number"
                  value={String(draft.priceXAF)}
                  onChange={(v) =>
                    patch({ priceXAF: Math.max(0, Number(v) || 0) })
                  }
                />
                {draft.ticketOnly ? (
                  <p className="mt-2 text-caption text-black02/65">
                    Not used while this is ticket-only — it is never sold on its
                    own.
                  </p>
                ) : (
                  <PriceReadout base={draft.priceXAF} layout="panel" />
                )}
              </Field>

              <Field
                label="Cash price at the venue (XAF)"
                hint="From the payments cutoff on, shop items are reserved and paid in cash at this price — no online fee. Blank = same as the base price."
              >
                <TextInput
                  type="number"
                  value={
                    draft.venuePriceXAF === undefined
                      ? ""
                      : String(draft.venuePriceXAF)
                  }
                  onChange={(v) =>
                    patch({
                      venuePriceXAF:
                        v.trim() === ""
                          ? undefined
                          : Math.max(0, Number(v) || 0),
                    })
                  }
                />
              </Field>

              <Field
                label="Images"
                hint="First image is the card cover. Drag to add several — each uploads immediately."
              >
                <MultiImageUpload
                  images={draft.images}
                  onChange={(images) => patch({ images })}
                  uploadPath={`products/${draft.id || "product"}`}
                  max={12}
                />
              </Field>

              <Field label="Status">
                <Segmented
                  name="product-status"
                  value={draft.status}
                  options={STATUSES}
                  onChange={(status) => patch({ status })}
                />
              </Field>

              <Field
                label="Sizes"
                hint="Leave every size off for a product with no size option."
              >
                <div className="flex flex-wrap gap-1.5">
                  {SIZES.map((size) => {
                    const on = draft.variants?.size?.includes(size) ?? false;
                    return (
                      <button
                        key={size}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const current = draft.variants?.size ?? [];
                          const nextSizes = on
                            ? current.filter((s) => s !== size)
                            : [...current, size];
                          patch({
                            variants: {
                              ...draft.variants,
                              size: nextSizes.length ? nextSizes : undefined,
                            },
                          });
                        }}
                        className={`rounded-pill border-2 px-3 py-1 font-mono text-caption font-bold transition-colors ${
                          on
                            ? "border-black02 bg-primary text-black02"
                            : "border-black02/25 text-black02/65 hover:bg-pastel"
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field
                label="Colors"
                hint="Leave empty for a product with no color option."
              >
                <ChipInput
                  values={draft.variants?.color ?? []}
                  onChange={(color) =>
                    patch({
                      variants: {
                        ...draft.variants,
                        color: color.length ? color : undefined,
                      },
                    })
                  }
                  placeholder="e.g. Noir"
                />
              </Field>

              <Field
                label="Stock per combination"
                hint="Omit a combination to leave it unlimited. Counted server-side against real orders — this number is a declared cap, not a live count."
              >
                <StockField
                  stock={draft.stock ?? []}
                  onChange={(stock) =>
                    patch({ stock: stock.length ? stock : undefined })
                  }
                />
              </Field>

              <Toggle
                checked={draft.published !== false}
                onChange={(published) => patch({ published })}
                label="Published"
                hint="Live on the public shop."
                disabled={draft.published === false && !canPublish}
                disabledHint="Add a price above 0 and at least one image before publishing."
              />

              <Toggle
                checked={draft.ticketOnly === true}
                // `undefined`, not `false`: the field is optional, and absent
                // means an ordinary shop product.
                onChange={(ticketOnly) =>
                  patch({ ticketOnly: ticketOnly ? true : undefined })
                }
                label="Ticket-only"
                hint="Comes with a ticket and is never sold alone — a certificate, for instance. It shows on the ticket tiers that bundle it, but is not listed in the shop and cannot be ordered."
              />
            </>
          );
        }}
      />
    </div>
  );
}

function StockField({
  stock,
  onChange,
}: {
  stock: { size?: string; color?: string; quantity: number }[];
  onChange: (v: { size?: string; color?: string; quantity: number }[]) => void;
}) {
  function update(i: number, changes: Partial<(typeof stock)[number]>) {
    onChange(
      stock.map((row, idx) => (idx === i ? { ...row, ...changes } : row)),
    );
  }
  function remove(i: number) {
    onChange(stock.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...stock, { quantity: 0 }]);
  }

  return (
    <div className="flex flex-col gap-2">
      {stock.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            value={row.size ?? ""}
            placeholder="Size (optional)"
            onChange={(e) => update(i, { size: e.target.value || undefined })}
            className="w-28 rounded-lg border border-black02/25 bg-offwhite px-2.5 py-1.5 font-sans text-caption text-black02"
          />
          <input
            value={row.color ?? ""}
            placeholder="Color (optional)"
            onChange={(e) => update(i, { color: e.target.value || undefined })}
            className="w-28 rounded-lg border border-black02/25 bg-offwhite px-2.5 py-1.5 font-sans text-caption text-black02"
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                update(i, { quantity: Math.max(0, row.quantity - 1) })
              }
              className="rounded-pill border border-black02/25 p-1 text-black02 hover:bg-pastel"
              aria-label="Decrease quantity"
            >
              <Minus size={12} weight="bold" />
            </button>
            <input
              type="number"
              min={0}
              value={row.quantity}
              onChange={(e) =>
                update(i, {
                  quantity: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-16 rounded-lg border border-black02/25 bg-offwhite px-2 py-1.5 text-center font-mono text-caption text-black02"
            />
            <button
              type="button"
              onClick={() => update(i, { quantity: row.quantity + 1 })}
              className="rounded-pill border border-black02/25 p-1 text-black02 hover:bg-pastel"
              aria-label="Increase quantity"
            >
              <Plus size={12} weight="bold" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-pill border border-black02/20 px-2.5 py-1 text-caption font-bold text-black02 hover:bg-danger-pastel hover:text-danger-ink"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex w-fit items-center gap-2 rounded-pill border border-black02/25 px-3.5 py-1.5 font-sans text-caption font-bold text-black02 hover:bg-pastel"
      >
        Add a combination
      </button>
    </div>
  );
}
