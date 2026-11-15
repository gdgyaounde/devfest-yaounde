import { CheckInScanner } from "@/components/admin/checkin/CheckInScanner";
import { getTiers } from "@/lib/content/store";

/**
 * `/{locale}/admin/check-in` — the door scanner (ADR 0078).
 *
 * Its own route, NOT a dashboard view: `/admin` loads every list up front,
 * which is the wrong trade on a phone on venue Wi-Fi with a queue waiting.
 * This page reads one thing — the tier names, so a scan can say "paid pass,
 * meal and swag" — and everything else is the scan itself.
 *
 * Gated by the admin layout like the rest of the tree (a non-organiser gets
 * a 404), and `POST /api/check-in` re-checks on every scan. No metadata
 * title, for the reason the layout gives; the scanner sets it on mount.
 */
export default async function CheckInPage() {
  const tiers = await getTiers();
  return (
    <CheckInScanner
      tiers={Object.fromEntries(
        tiers.map((tier) => [
          tier.id,
          { name: tier.name, paid: tier.priceXAF > 0 },
        ]),
      )}
    />
  );
}
