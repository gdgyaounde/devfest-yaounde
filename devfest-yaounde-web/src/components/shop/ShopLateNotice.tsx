import { Package } from "@phosphor-icons/react/dist/ssr";

/**
 * "You can still order, but items ordered now may not be ready by event day"
 * (ADR 0072).
 *
 * The shop stays open after the ticket sales cutoff, on purpose — but a
 * T-shirt ordered on Thursday is unlikely to be printed by Saturday, and
 * saying so up front is kinder than a disappointed pickup. Shown on the
 * listing, the product page and every checkout step; the same promise is in
 * the consent line the buyer ticks (`pages.shop.returnsAck`).
 *
 * Plain markup, no hooks, so server pages and the client checkout share it.
 * The text arrives resolved (with the event's date), or not at all once the
 * event is over — see `shopLateNotice()`.
 */
export function ShopLateNotice({
  text,
  className = "",
}: {
  text: string | null;
  className?: string;
}) {
  if (!text) return null;
  return (
    <p
      role="note"
      className={`flex max-w-3xl items-start gap-3 rounded-lg border-2 border-black02 bg-offwhite px-5 py-4 text-body-m font-bold text-black02 ${className}`}
    >
      <Package
        size={24}
        weight="duotone"
        aria-hidden
        className="mt-0.5 shrink-0"
      />
      <span>{text}</span>
    </p>
  );
}
