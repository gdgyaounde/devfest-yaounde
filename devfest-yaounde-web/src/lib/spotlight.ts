/**
 * The home page's daily speaker spotlight (ADR 0073).
 *
 * There is no agenda to feature yet, so the home reel shows a handful of
 * speakers that changes every day — the same handful for everyone that day.
 *
 * ## Fair, not merely random
 *
 * A fresh shuffle every day would let the same faces come up three days
 * running while someone else never appears. Instead the speakers are shuffled
 * ONCE PER CYCLE, and each day shows the next window of that order:
 *
 *   cycle length = ceil(M / N) days      (24 speakers, 6 a day → 4 days)
 *   day d shows   perm[(d mod cycle)·N … +N), wrapping around
 *
 * so every speaker is shown at least once per cycle (exactly once when N
 * divides M). The next cycle reshuffles, so the line-ups do not repeat in
 * the same order forever.
 *
 * ## Deterministic
 *
 * The day is the calendar date IN YAOUNDÉ (`Africa/Douala`), so the reel
 * rotates at local midnight wherever the server runs, and the seed is that
 * date — the server renders the picks and the client only receives them,
 * so there is nothing to disagree about at hydration.
 *
 * `featured: true` still wins: featured speakers are pinned first, and the
 * rotation fills the remaining slots from everyone else.
 */

/** How many speakers the home reel shows per day. */
export const SPOTLIGHT_SIZE = 6;

/** "YYYY-MM-DD" of `now` in Yaoundé. */
export function spotlightDateKey(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Whole days since 1970-01-01 for a "YYYY-MM-DD" key. */
function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** mulberry32 — tiny, fast, good enough to shuffle a speaker list. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string, for a seed that mixes the cycle and the ids. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list];
  const rand = prng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Today's spotlight: featured speakers first, then today's window of the
 * fair rotation. Never a duplicate; fewer speakers than `size` simply shows
 * them all.
 */
export function pickSpotlight<T extends { id: string; featured?: boolean }>(
  speakers: T[],
  dateKey: string,
  size: number = SPOTLIGHT_SIZE,
): T[] {
  if (size <= 0 || speakers.length === 0) return [];

  const featured = speakers.filter((s) => s.featured).slice(0, size);
  const slots = size - featured.length;
  // Sorted by id first so the rotation does not depend on the order the
  // dashboard happens to store people in — reordering the list must not
  // reshuffle the week.
  const pool = speakers
    .filter((s) => !s.featured)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (slots <= 0 || pool.length === 0) return featured;
  if (pool.length <= slots)
    return [...featured, ...shuffle(pool, hash(dateKey))];

  const cycleLength = Math.ceil(pool.length / slots);
  const day = dayNumber(dateKey);
  const cycle = Math.floor(day / cycleLength);
  const perm = shuffle(
    pool,
    hash(`${cycle}|${pool.map((s) => s.id).join(",")}`),
  );
  const start = (((day % cycleLength) + cycleLength) % cycleLength) * slots;

  const picks: T[] = [];
  const seen = new Set<string>();
  for (let i = 0; picks.length < slots && i < perm.length; i++) {
    const s = perm[(start + i) % perm.length];
    if (!seen.has(s.id)) {
      seen.add(s.id);
      picks.push(s);
    }
  }
  return [...featured, ...picks];
}
