"use client";

import { useState } from "react";
import {
  ArrowSquareOut,
  Check,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import type { Product, TicketTier } from "@/data/types";
import type { AdminData, AdminSettings } from "@/lib/admin/shape";
import { slugify } from "@/lib/admin/form-helpers";
import { EntityCrud } from "../forms/EntityCrud";
import { PriceReadout } from "../forms/PriceReadout";
import {
  EntitlementListField,
  Field,
  LocalizedInput,
  TextInput,
  Toggle,
} from "../forms/fields";
import { InfoBanner } from "./shared";

export function AdminTicketTiers({
  rows,
  data,
  settings,
  products,
  onGoToShop,
}: {
  rows: TicketTier[];
  data: AdminData;
  settings: AdminSettings;
  products: Product[];
  /**
   * Switch the dashboard to the Shop view. A callback rather than a link:
   * the admin is one client component that swaps views in state, so an
   * `<a href="/admin?view=shop">` would reload the whole dashboard to reach
   * a screen that is already mounted a state change away.
   */
  onGoToShop: () => void;
}) {
  const capacityTotal = settings.capacity.total;
  const capSum = rows.reduce(
    (sum, tier) => sum + (tier.quantityAvailable ?? 0),
    0,
  );
  const overCapacity =
    capacityTotal != null && capacityTotal > 0 && capSum > capacityTotal;

  function soldCount(tierId: string): number {
    return data.tickets.rows.filter((t) => t.tierId === tierId).length;
  }

  return (
    <div className="flex flex-col gap-5">
      {overCapacity && (
        <InfoBanner tone="warn">
          Tier caps add up to {capSum} tickets, above the overall capacity of{" "}
          {capacityTotal} set in Info bar &amp; policies. This does not block
          sales — checkout still gates on each tier&rsquo;s own cap — but the
          public counter can undercount how many of these tiers could actually
          sell out. Raise the overall capacity or lower a tier cap.
        </InfoBanner>
      )}

      <EntityCrud<TicketTier>
        collection="ticket-tiers"
        rows={rows}
        addLabel="Add a tier"
        emptyLabel="No tiers yet."
        rowToggle={{
          value: (row) => row.onSale,
          apply: (row, next) => ({ ...row, onSale: next }),
          label: (on) => (on ? "Take off sale" : "Put on sale"),
          saved: (on) =>
            on
              ? "On sale."
              : "Off sale — hidden from the tier list, and still resolvable for tickets already sold on it.",
        }}
        sections={{ on: "On sale", off: "Off sale" }}
        describeImpact={(tier) => {
          const sold = soldCount(tier.id);
          if (sold === 0) return null;
          return {
            blocked: true,
            message: `${sold} ticket${sold === 1 ? "" : "s"} already sold on this tier. Turn off "On sale" or mark it sold out instead of deleting — deleting would orphan those tickets' tier reference.`,
          };
        }}
        blank={() => ({
          id: "",
          name: "",
          priceXAF: 0,
          description: { fr: "", en: "" },
          perks: [],
          includesApparel: false,
          onSale: true,
        })}
        renderRow={(row) => (
          <div className="flex items-center gap-3">
            <span className="rounded-pill border-2 border-black02 px-2.5 py-0.5 font-mono text-mono-tag font-bold text-black02">
              {row.name}
            </span>
            <div className="min-w-0">
              <PriceReadout base={row.priceXAF} />
              {row.quantityAvailable != null && (
                <p className="truncate text-caption text-black02/65">
                  {row.quantityAvailable} cap
                </p>
              )}
              <p className="truncate text-caption text-black02/65">
                {row.onSale ? "On sale" : "Off sale"}
                {row.soldOut && " · Sold out"}
              </p>
            </div>
          </div>
        )}
        renderForm={(draft, patch) => (
          <>
            <Field label="Name" hint="Proper-noun tier name, e.g. SONNET.">
              <TextInput
                value={draft.name}
                onChange={(name) =>
                  patch(draft.id ? { name } : { name, id: slugify(name) })
                }
              />
            </Field>

            <Field label="Id">
              <TextInput value={draft.id} onChange={(id) => patch({ id })} />
            </Field>

            <Field
              label="Sub-label"
              hint='Optional, beside the name (e.g. "Free pass"). Leave blank when the name says enough.'
            >
              <LocalizedInput
                value={draft.label ?? { fr: "", en: "" }}
                onChange={(label) => patch({ label })}
              />
            </Field>

            <Field
              label="Base price (XAF)"
              hint="Enter the base price, without the fee. The displayed price is worked out from it automatically, everywhere this tier is shown."
            >
              <TextInput
                type="number"
                value={String(draft.priceXAF)}
                onChange={(v) =>
                  patch({ priceXAF: Math.max(0, Number(v) || 0) })
                }
              />
              <PriceReadout base={draft.priceXAF} layout="panel" />
            </Field>

            <Field
              label="Cash price at the venue (XAF)"
              hint="From the payments cutoff on, people reserve and pay this in cash — no online fee. Blank = same as the base price."
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
                      v.trim() === "" ? undefined : Math.max(0, Number(v) || 0),
                  })
                }
              />
            </Field>

            <Field
              label="Quantity available"
              hint="Blank = unlimited. Enforced server-side at checkout regardless of what this admin shows."
            >
              <TextInput
                type="number"
                value={draft.quantityAvailable?.toString() ?? ""}
                onChange={(v) =>
                  patch({
                    quantityAvailable:
                      v.trim() === "" ? undefined : Math.max(0, Number(v) || 0),
                  })
                }
              />
            </Field>

            <div className="flex flex-wrap gap-6">
              <Toggle
                checked={draft.onSale}
                onChange={(onSale) => patch({ onSale })}
                label="On sale"
                hint="Off hides it from the tier list."
              />
              <Toggle
                checked={Boolean(draft.soldOut)}
                onChange={(soldOut) => patch({ soldOut })}
                label="Sold out"
                hint="Independent of quantity — pulls the tier off sale regardless of remaining cap."
              />
              <Toggle
                checked={draft.includesApparel}
                onChange={(includesApparel) => patch({ includesApparel })}
                label="Includes apparel"
                hint="Collects an attendee size at checkout."
              />
              <Toggle
                checked={Boolean(draft.rsvpExternal)}
                onChange={(rsvpExternal) => patch({ rsvpExternal })}
                label="RSVP off-site"
                hint="Delegates to Bevy instead of selling here — the free tier."
              />
            </div>

            <Field label="Description">
              <LocalizedInput
                value={draft.description}
                onChange={(description) => patch({ description })}
                multiline
              />
            </Field>

            <Field
              label="What this ticket grants"
              hint="Rendered as a checklist on the public tier card, in this order."
            >
              <EntitlementListField
                values={draft.perks}
                onChange={(perks) => patch({ perks })}
              />
            </Field>

            <Field
              label="Swag included"
              hint="Pick from what the Shop already sells. Attaching an item here never creates a product — it points at an existing listing, so the same t-shirt across four tiers stays one listing."
            >
              <SwagPickerField
                selected={draft.swagProductIds ?? []}
                products={products}
                onChange={(swagProductIds) => patch({ swagProductIds })}
                onGoToShop={onGoToShop}
              />
            </Field>
          </>
        )}
      />
    </div>
  );
}

/**
 * Attach EXISTING shop products to a tier (ADR 0054).
 *
 * This replaced a form that built swag items from scratch inside the ticket
 * editor, each of which auto-created its own shop listing. That produced
 * duplicates in practice — the same t-shirt bundled with four tiers became
 * four near-identical products, and every tier edit could mint more. Picking
 * cannot: attaching the same listing to four tiers is four references to one
 * row, and detaching it from a tier leaves the shop untouched.
 *
 * The selected list is ORDERED and the order is the admin's — it is what the
 * public preview renders, biggest-first by convention — so the chips can be
 * moved rather than only added and removed.
 */
function SwagPickerField({
  selected,
  products,
  onChange,
  onGoToShop,
}: {
  selected: string[];
  products: Product[];
  onChange: (ids: string[]) => void;
  onGoToShop: () => void;
}) {
  const [query, setQuery] = useState("");

  const byId = new Map(products.map((product) => [product.id, product]));
  const needle = query.trim().toLowerCase();

  /*
   * Ids the admin picked that no longer resolve — a listing deleted from the
   * Shop since. Surfaced rather than silently dropped: quietly rewriting
   * somebody's selection on render would make the fix invisible, and the
   * public preview already skips them, so the tier is not broken meanwhile.
   */
  const dangling = selected.filter((id) => !byId.has(id));

  const available = products.filter((product) => {
    if (selected.includes(product.id)) return false;
    if (!needle) return true;
    return (
      product.id.toLowerCase().includes(needle) ||
      product.name.en.toLowerCase().includes(needle) ||
      product.name.fr.toLowerCase().includes(needle)
    );
  });

  function attach(id: string) {
    onChange([...selected, id]);
    setQuery("");
  }
  function detach(id: string) {
    onChange(selected.filter((value) => value !== id));
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  // Nothing to pick from at all — the one case where the answer is not on
  // this screen, so it says where it is instead of showing an empty box.
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black02/25 px-4 py-6 text-center">
        <p className="font-sans text-body-m font-bold text-black02">
          No shop items yet.
        </p>
        <p className="mx-auto mt-1 max-w-sm text-caption text-black02/65">
          Swag is picked from the Shop, not created here. Add the products first
          and they will show up in this list.
        </p>
        <button
          type="button"
          onClick={onGoToShop}
          className="mt-3 inline-flex items-center gap-1.5 rounded-pill border border-black02/25 bg-primary px-3.5 py-1.5 font-sans text-caption font-bold text-black02 hover:brightness-95"
        >
          Go to Shop
          <ArrowSquareOut size={12} weight="bold" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black02/25 px-4 py-4 text-center text-caption text-black02/65">
          Nothing attached yet — this tier shows no swag on the public page.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {selected.map((id, index) => {
            const product = byId.get(id);
            return (
              <li
                key={id}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                  product
                    ? "border-black02/15 bg-pastel/40"
                    : "border-danger/40 bg-danger-pastel"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black02/15 bg-offwhite">
                  {product?.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-mono text-caption text-black02/65">
                      —
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-body-m font-bold text-black02">
                    {product ? product.name.en || product.name.fr : id}
                  </span>
                  <span className="block text-caption text-black02/65">
                    {product ? (
                      <>
                        {product.ticketOnly ? (
                          <span className="block">
                            Ticket-only — not sold in the shop
                          </span>
                        ) : (
                          <PriceReadout base={product.priceXAF} />
                        )}
                        {product.published === false && (
                          <span className="block">Hidden in shop</span>
                        )}
                      </>
                    ) : (
                      "No longer in the shop — remove it, or re-add the product."
                    )}
                  </span>
                </span>

                {/* Order is what the public preview renders in. */}
                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${id} earlier`}
                    className="rounded-pill px-1.5 py-1 font-mono text-caption font-bold text-black02/65 hover:bg-offwhite hover:text-black02 disabled:opacity-25"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === selected.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${id} later`}
                    className="rounded-pill px-1.5 py-1 font-mono text-caption font-bold text-black02/65 hover:bg-offwhite hover:text-black02 disabled:opacity-25"
                  >
                    ↓
                  </button>
                </span>

                <button
                  type="button"
                  onClick={() => detach(id)}
                  aria-label={`Detach ${id}`}
                  className="shrink-0 rounded-pill border border-black02/20 p-1.5 text-black02 hover:bg-danger-pastel hover:text-danger-ink"
                >
                  <X size={12} weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {dangling.length > 0 && (
        <p className="text-caption font-bold text-danger-ink">
          {dangling.length} attached item
          {dangling.length === 1 ? " is" : "s are"} no longer in the shop.
          Detaching {dangling.length === 1 ? "it" : "them"} here is safe — the
          public page already skips {dangling.length === 1 ? "it" : "them"}.
        </p>
      )}

      <div className="rounded-lg border border-black02/15 bg-offwhite p-2.5">
        <label className="flex items-center gap-2 rounded-pill border border-black02/20 bg-pastel/40 px-3 py-1.5">
          <MagnifyingGlass
            size={14}
            weight="bold"
            aria-hidden
            className="shrink-0 text-black02/65"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search shop products to attach"
            className="min-w-0 flex-1 bg-transparent font-sans text-body-m text-black02 outline-none placeholder:text-black02/40"
          />
        </label>

        {available.length === 0 ? (
          <p className="px-1 py-3 text-center text-caption text-black02/65">
            {needle
              ? "Nothing in the shop matches that."
              : "Every shop product is already attached to this tier."}
          </p>
        ) : (
          /* Capped, not scrolled-forever: this sits inside a drawer that
             already scrolls, and a nested scroller here would trap the
             wheel. Narrowing the search is the way to reach the rest. */
          <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {available.slice(0, 40).map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => attach(product.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-pastel"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-black02/15 bg-pastel">
                    {product.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.images[0]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="font-mono text-caption text-black02/65">
                        —
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-sans text-body-m text-black02">
                    {product.name.en || product.name.fr || product.id}
                    {product.published === false && (
                      <span className="ml-1.5 font-mono text-caption text-black02/65">
                        (hidden in shop)
                      </span>
                    )}
                  </span>
                  <Check
                    size={13}
                    weight="bold"
                    aria-hidden
                    className="shrink-0 text-black02/35"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
