/**
 * The offline backup list (ADR 0090): the door roster a staff phone keeps in
 * its own storage, for the moments with no signal.
 *
 * Pure and client-safe (types, search, expiry) so it is unit-tested; the route
 * that builds it and the page that shows it both import from here.
 *
 * WHAT IS IN IT: name, pass, badge code and whether they had been checked in
 * when it was made. For reservations: reference, name, status and the cash
 * owed. NEVER an email, a phone number or anything from a payment.
 */

export interface BackupTicket {
  /** Attendee name. */
  n: string;
  /** Tier id. */
  t: string;
  /** Badge code (DFY-XXXXX-XXXXX). */
  c: string;
  /** Checked in when the list was made. */
  i: boolean;
  /** Refund standing: "r" refunded (entry only), "p" a request is open. */
  f?: "r" | "p";
}

export interface BackupReservation {
  /** Reference (RES-XXXXXX). */
  r: string;
  /** Contact name. */
  n: string;
  /** reserved | cash_received | cancelled. */
  s: "reserved" | "cash_received" | "cancelled";
  /** XAF owed (or paid). */
  x: number;
  /** One short label per ticket and item, e.g. "Sonnet · Ada Fotso". */
  l: string[];
  /** Checked in when the list was made. */
  i: boolean;
}

export interface BackupList {
  /** ISO time the roster was read. */
  generatedAt: string;
  /** ISO time after which a phone must drop it (staff access end). */
  expiresAt: string;
  tiers: Record<string, { name: string; paid: boolean }>;
  tickets: BackupTicket[];
  reservations: BackupReservation[];
}

/** What the phone keeps: the roster, and when this phone got it. */
export interface StoredBackup {
  list: BackupList;
  savedAt: number;
}

export function backupExpired(
  list: Pick<BackupList, "expiresAt">,
  now: number = Date.now(),
): boolean {
  const end = Date.parse(list.expiresAt);
  return Number.isFinite(end) ? now >= end : true;
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Squash a typed code the way the door does (O→0, I/L→1), minus dashes. */
const foldCode = (s: string) =>
  s
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

/**
 * Find people on the device: any part of a name (accents and case ignored),
 * any part of a badge code, or a reservation reference. Two characters is
 * enough on-device — there is no server to protect from a short query.
 */
export function searchBackup(
  list: BackupList,
  query: string,
  limit = 25,
): { tickets: BackupTicket[]; reservations: BackupReservation[] } {
  const q = fold(query.trim());
  const code = foldCode(query);
  if (q.length < 2) return { tickets: [], reservations: [] };
  const tickets = list.tickets
    .filter(
      (t) =>
        fold(t.n).includes(q) ||
        (code.length >= 3 && foldCode(t.c).includes(code)),
    )
    .slice(0, limit);
  const reservations = list.reservations
    .filter(
      (r) =>
        fold(r.n).includes(q) ||
        (code.length >= 3 && foldCode(r.r).includes(code)),
    )
    .slice(0, limit);
  return { tickets, reservations };
}
