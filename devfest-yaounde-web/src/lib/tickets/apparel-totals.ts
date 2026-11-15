import { APPAREL_SIZES } from "./self-edit";

/**
 * T-shirt (and polo, hoodie…) counts per tier and size — what the organisers
 * order the apparel from (ADR 0075).
 *
 * Per TIER as well as overall, because the item differs by tier: one tier's
 * "M" is a tee, another's is a hoodie. Tickets on an apparel tier with no
 * size yet are counted as `missing`, so a gap shows up instead of quietly
 * shrinking the order. Sizes outside the known list (an old import, a typo
 * fixed by hand in the database) are kept under their own name rather than
 * dropped.
 */
export interface ApparelTotals {
  sizes: string[];
  tiers: {
    tierId: string;
    counts: Record<string, number>;
    missing: number;
    total: number;
  }[];
  totals: Record<string, number>;
  missing: number;
}

export function apparelTotals(
  rows: { tier_id: string; apparel_size: string | null }[],
  apparelTierIds: string[],
): ApparelTotals {
  const apparel = new Set(apparelTierIds);
  const extra = new Set<string>();
  const byTier = new Map<
    string,
    { counts: Record<string, number>; missing: number; total: number }
  >();
  for (const id of apparelTierIds) {
    byTier.set(id, { counts: {}, missing: 0, total: 0 });
  }
  for (const row of rows) {
    if (!apparel.has(row.tier_id)) continue;
    const bucket = byTier.get(row.tier_id)!;
    bucket.total += 1;
    const size = row.apparel_size?.trim().toUpperCase();
    if (!size) {
      bucket.missing += 1;
      continue;
    }
    if (!(APPAREL_SIZES as readonly string[]).includes(size)) extra.add(size);
    bucket.counts[size] = (bucket.counts[size] ?? 0) + 1;
  }
  const sizes = [...APPAREL_SIZES, ...[...extra].sort()];
  const totals: Record<string, number> = {};
  let missing = 0;
  for (const bucket of byTier.values()) {
    missing += bucket.missing;
    for (const [size, n] of Object.entries(bucket.counts)) {
      totals[size] = (totals[size] ?? 0) + n;
    }
  }
  return {
    sizes,
    tiers: [...byTier.entries()]
      .map(([tierId, b]) => ({ tierId, ...b }))
      .filter((t) => t.total > 0),
    totals,
    missing,
  };
}
