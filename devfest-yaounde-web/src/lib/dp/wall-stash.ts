/**
 * One card on the wall per photo, per visit (ADR 0081).
 *
 * Every Download, Share and Copy used to stash a fresh copy on the wall, so
 * one person pressing three buttons — or downloading twice — appeared three
 * times. The rule, decided before anything is sent:
 *
 *   - nothing stashed yet in this visit              → submit
 *   - a DIFFERENT photo than the last stashed card   → submit (it is a new
 *     card — someone making cards for friends on one phone keeps them all)
 *   - the same photo, and the card has not changed   → skip (it is already
 *     on the wall)
 *   - the same photo, but the card was edited since  → replace: submit the
 *     new version, then take the old one down with its deletion token
 *
 * Pure, so it is unit-tested; the generator holds the last stash in a ref.
 */
export interface WallStash {
  /** Fingerprint of everything drawn on the card. */
  key: string;
  /** Which uploaded photo it was made from (a per-upload counter). */
  photoKey: number;
}

export type WallStashPlan = "submit" | "skip" | "replace";

export function planWallStash(
  previous: WallStash | null,
  next: WallStash,
): WallStashPlan {
  if (!previous || previous.photoKey !== next.photoKey) return "submit";
  return previous.key === next.key ? "skip" : "replace";
}
