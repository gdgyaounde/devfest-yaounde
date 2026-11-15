import "server-only";
import { revalidatePath } from "next/cache";
import { routing } from "@/i18n/routing";
import type { CollectionId } from "./schemas";

/**
 * Push a content change out to the public site.
 *
 * WHY THIS EXISTS AT ALL — and it is the bug that made the whole dashboard
 * look broken. Every public page is statically prerendered (`●` in the build
 * output). So a photo uploaded through the admin was written to the database
 * correctly, read back by the admin correctly, and then **never appeared on
 * the site**, because /fr/team is HTML that was generated at build time and
 * has no reason to be generated again.
 *
 * That defeats the entire premise of the content store (ADR 0031): edit the
 * site without a deploy. Without this, every edit needed a deploy.
 *
 * WHY ON-DEMAND AND NOT `export const revalidate = 60`. A time window means
 * an organiser saves, reloads, sees nothing, and cannot tell a slow cache
 * from a failed save — so they save again, and again. Invalidating the exact
 * paths a change touched makes the reload after a save always correct, and
 * costs nothing on every other request: the pages stay static and cheap.
 */

/**
 * Which pages each collection is visible on.
 *
 * Deliberately explicit rather than "revalidate everything". A wrong entry
 * here shows a stale page, which is visible and reported; blanket
 * invalidation would quietly throw away the whole static build on every
 * keystroke-sized edit and nobody would notice until the bill.
 *
 * `/` is the home page, which reads speakers (the lineup or the call for
 * speakers), quotes, FAQs, sponsors and past editions.
 */
const PAGES: Record<CollectionId, string[]> = {
  /*
   * Speakers and sessions show on each other's pages (ADR 0073): a session
   * card names its speakers, a speaker profile shows their session, and the
   * home page carries both the spotlight and the programme preview. Saving
   * either has to refresh all three, or a rename shows on one page and not
   * the next.
   */
  speakers: ["/", "/speakers", "/schedule"],
  team: ["/team"],
  sessions: ["/schedule", "/", "/speakers"],
  sponsors: ["/"],
  faqs: ["/", "/faqs"],
  // `/tickets` too: tier cards render their swag FROM products (ADR 0054),
  // so hiding or renaming a product has to reach them, not just the shop.
  products: ["/shop", "/tickets"],
  "ticket-tiers": ["/tickets"],
  quotes: ["/"],
  stats: ["/"],
  "past-editions": ["/"],
};

/** Every locale's copy of a path, since each is prerendered separately. */
function localised(path: string): string[] {
  return routing.locales.map((locale) =>
    path === "/" ? `/${locale}` : `/${locale}${path}`,
  );
}

/** Every locale's path a save to this collection must refresh. */
export function revalidationPaths(id: CollectionId): string[] {
  // No `?? []` — `PAGES` is keyed by `CollectionId`, so a new collection
  // fails to compile until somebody says where it is shown. That is the
  // point: a missing entry here is a page that silently never updates.
  return PAGES[id].flatMap(localised);
}

export function revalidateCollection(id: CollectionId): void {
  for (const full of revalidationPaths(id)) revalidatePath(full);
}

/**
 * Settings reach the announcement banner, which is in the ROOT LAYOUT — so
 * it is on every page, and every page has to be rebuilt.
 *
 * ## Why `revalidatePath('/', 'layout')` and not a loop over `/fr` and `/en`
 *
 * This used to call `revalidatePath(\`/\${locale}\`, "layout")` for each
 * locale — a LITERAL, already-resolved path together with the `'layout'`
 * type. The Next.js reference for this version says plainly not to do that:
 * "If `path` is a literal path like `/product/1`, omit `type`" — `type` is
 * for a ROUTE PATTERN with a dynamic segment placeholder (`/product/[slug]`),
 * telling Next which FILE to match against. `/fr` is not that pattern; the
 * file is `[locale]/layout.tsx`. So the call was a documented misuse of the
 * API — silently not the "every page rebuilds" it claimed to be, which is
 * exactly why a hero image could upload successfully, write to the database
 * correctly, and still not appear: the stale prerendered HTML was never
 * actually invalidated.
 *
 * The docs give the exact fix as their own worked example, titled
 * "Revalidating all data": `revalidatePath('/', 'layout')`. One call on the
 * app root, which cascades down through every nested layout — including
 * `[locale]/layout.tsx` for both locales — and every page beneath them.
 */
export function revalidateSettings(): void {
  revalidatePath("/", "layout");
}
