/**
 * The device's copy of "This interests me" (ADR 0086, 0088): so a signed-in
 * visitor's favourites still show — and can be filtered to — with no signal.
 *
 * Only session ids, and only in this browser's localStorage. Kept in step
 * with the server whenever it can be reached, and cleared the moment the
 * server says nobody is signed in.
 */

const KEY = "devfest:interests:v1";

export interface InterestCache {
  ids: string[];
  at: number;
}

/** `storage` is a parameter so the logic is testable without a browser. */
export function readInterestCache(
  storage: Pick<Storage, "getItem">,
): InterestCache | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InterestCache>;
    if (
      !parsed ||
      !Array.isArray(parsed.ids) ||
      !parsed.ids.every((id) => typeof id === "string")
    ) {
      return null;
    }
    return { ids: parsed.ids, at: Number(parsed.at) || 0 };
  } catch {
    return null;
  }
}

export function writeInterestCache(
  storage: Pick<Storage, "setItem">,
  ids: readonly string[],
  now: number = Date.now(),
): void {
  try {
    storage.setItem(KEY, JSON.stringify({ ids: [...ids], at: now }));
  } catch {
    // Storage full or blocked: the live list still works while online.
  }
}

export function clearInterestCache(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
