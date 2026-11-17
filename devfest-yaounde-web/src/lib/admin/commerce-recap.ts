/**
 * The commerce recap (ADR 0083): what was sold across tickets AND the shop,
 * and how many of each item has to be accounted for — the items in each
 * ticket's "In the box" plus what shop orders contain.
 *
 * Pure, so the arithmetic organisers stock the day from is unit-tested.
 *
 * What counts:
 *   - a ticket counts unless a refund on it was RESOLVED (paid out), the same
 *     rule the meal/swag tables use (ADR 0079);
 *   - a shop order counts unless it is cancelled or a refund on it was
 *     resolved;
 *   - a ticket tier's swag is by REFERENCE (ADR 0054): each ticket sold on a
 *     tier brings one of every product in that tier's `swagProductIds`.
 */

export interface RecapTier {
  id: string;
  name: string;
  priceXAF: number;
  swagProductIds?: string[];
}

export interface RecapProduct {
  id: string;
  name: { fr: string; en: string };
}

export interface RecapTicket {
  id: string;
  badge_code: string;
  deposit_id: string;
  tier_id: string;
}

export interface RecapOrder {
  id: string;
  status: string;
  items: {
    productId: string;
    name: { fr: string; en: string } | string;
    quantity: number;
    unitAmount: number;
    variant: unknown;
  }[];
}

export interface CommerceRecap {
  tickets: { tierId: string; name: string; priceXAF: number; sold: number }[];
  ticketsSold: number;
  shop: {
    productId: string;
    name: string;
    variant: string;
    quantity: number;
    revenue: number;
  }[];
  shopUnits: number;
  shopRevenue: number;
  /** One row per item to account for, biggest total first. */
  swag: {
    productId: string;
    name: string;
    fromTickets: number;
    fromShop: number;
    total: number;
  }[];
}

const label = (name: RecapProduct["name"] | string, fallback: string) =>
  typeof name === "string" ? name : name.en || name.fr || fallback;

/** "size M · colour blanc" from an order line's variant, or "". */
export function variantLabel(variant: unknown): string {
  if (!variant || typeof variant !== "object") return "";
  const v = variant as { size?: unknown; color?: unknown };
  return [
    typeof v.size === "string" && v.size ? `size ${v.size}` : "",
    typeof v.color === "string" && v.color ? `colour ${v.color}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function commerceRecap(input: {
  tiers: RecapTier[];
  products: RecapProduct[];
  tickets: RecapTicket[];
  orders: RecapOrder[];
  /** Lower-cased `refund_requests.reference` values whose refund was paid out. */
  refunded: ReadonlySet<string>;
}): CommerceRecap {
  const { tiers, products, tickets, orders, refunded } = input;
  const productName = new Map(
    products.map((p) => [p.id, label(p.name, p.id)] as const),
  );

  // ---- tickets
  const sold = new Map<string, number>();
  for (const t of tickets) {
    const refs = [t.id, t.badge_code, t.deposit_id].map((r) => r.toLowerCase());
    if (refs.some((r) => refunded.has(r))) continue;
    sold.set(t.tier_id, (sold.get(t.tier_id) ?? 0) + 1);
  }
  const ticketRows = tiers
    .map((tier) => ({
      tierId: tier.id,
      name: tier.name,
      priceXAF: tier.priceXAF,
      sold: sold.get(tier.id) ?? 0,
    }))
    .filter((row) => row.sold > 0);

  // ---- shop
  const shop = new Map<
    string,
    {
      productId: string;
      name: string;
      variant: string;
      quantity: number;
      revenue: number;
    }
  >();
  const shopByProduct = new Map<string, number>();
  for (const order of orders) {
    if (order.status === "cancelled" || refunded.has(order.id.toLowerCase())) {
      continue;
    }
    for (const item of order.items) {
      const variant = variantLabel(item.variant);
      const key = `${item.productId}|${variant}`;
      const row = shop.get(key) ?? {
        productId: item.productId,
        name:
          productName.get(item.productId) ?? label(item.name, item.productId),
        variant,
        quantity: 0,
        revenue: 0,
      };
      row.quantity += item.quantity;
      row.revenue += item.quantity * item.unitAmount;
      shop.set(key, row);
      shopByProduct.set(
        item.productId,
        (shopByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }
  }
  const shopRows = [...shop.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.variant.localeCompare(b.variant),
  );

  // ---- swag to account for: ticket boxes + shop orders
  const fromTickets = new Map<string, number>();
  for (const tier of tiers) {
    const n = sold.get(tier.id) ?? 0;
    if (!n) continue;
    for (const id of new Set(tier.swagProductIds ?? [])) {
      fromTickets.set(id, (fromTickets.get(id) ?? 0) + n);
    }
  }
  const ids = new Set([...fromTickets.keys(), ...shopByProduct.keys()]);
  const swag = [...ids]
    .map((productId) => {
      const a = fromTickets.get(productId) ?? 0;
      const b = shopByProduct.get(productId) ?? 0;
      return {
        productId,
        name: productName.get(productId) ?? productId,
        fromTickets: a,
        fromShop: b,
        total: a + b,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    tickets: ticketRows,
    ticketsSold: ticketRows.reduce((n, r) => n + r.sold, 0),
    shop: shopRows,
    shopUnits: shopRows.reduce((n, r) => n + r.quantity, 0),
    shopRevenue: shopRows.reduce((n, r) => n + r.revenue, 0),
    swag,
  };
}
