import "server-only";
import { getTiers } from "@/lib/content/store";
import type { StationTier } from "@/lib/staff/results";

/** Tier names and paid/free, for the stations to label a pass with. */
export async function stationTiers(): Promise<Record<string, StationTier>> {
  const tiers = await getTiers();
  return Object.fromEntries(
    tiers.map((tier) => [
      tier.id,
      { name: tier.name, paid: tier.priceXAF > 0 },
    ]),
  );
}
