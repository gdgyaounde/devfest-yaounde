/**
 * Who gets the "paid" launch update (ADR 0076) — built here, pure, so the
 * union / de-duplication / CSV rules are unit-tested without a database.
 *
 * The union of three lists, lower-cased and de-duplicated:
 *   - `ticket`  — every ticket's attendee email (holders);
 *   - `buyer`   — the contact email on every ACTIVATED ticket payment intent
 *                 (buyers who may hold no ticket themselves);
 *   - `profile` — every signed-in site user's email.
 *
 * An address that appears in several lists is listed once, under the first
 * source in that order (a holder is the strongest reason to email someone),
 * with the best name and locale any source had.
 */
export type RecipientSource = "ticket" | "buyer" | "profile";

export interface Recipient {
  email: string;
  name: string;
  source: RecipientSource;
  locale: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildRecipients(input: {
  tickets: {
    attendee_email: string;
    attendee_name: string;
    deposit_id: string;
  }[];
  intents: { deposit_id: string; contact: unknown; locale: string | null }[];
  profiles: { email: string | null; display_name: string | null }[];
}): Recipient[] {
  const localeByDeposit = new Map(
    input.intents.map((i) => [
      i.deposit_id,
      i.locale === "en" ? "en" : i.locale === "fr" ? "fr" : "",
    ]),
  );
  const out = new Map<string, Recipient>();
  const add = (
    rawEmail: unknown,
    name: string,
    source: RecipientSource,
    locale: string,
  ) => {
    const email = clean(rawEmail).toLowerCase();
    if (!EMAIL.test(email)) return;
    const existing = out.get(email);
    if (!existing) {
      out.set(email, { email, name, source, locale });
      return;
    }
    // Keep the first (strongest) source; fill in what it lacked.
    if (!existing.name && name) existing.name = name;
    if (!existing.locale && locale) existing.locale = locale;
  };

  for (const t of input.tickets) {
    add(
      t.attendee_email,
      clean(t.attendee_name),
      "ticket",
      localeByDeposit.get(t.deposit_id) ?? "",
    );
  }
  for (const i of input.intents) {
    const contact = (i.contact ?? {}) as { email?: unknown };
    add(contact.email, "", "buyer", localeByDeposit.get(i.deposit_id) ?? "");
  }
  for (const p of input.profiles) {
    add(p.email, clean(p.display_name), "profile", "");
  }
  return [...out.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export function countBySource(
  rows: Recipient[],
): Record<RecipientSource, number> {
  const counts: Record<RecipientSource, number> = {
    ticket: 0,
    buyer: 0,
    profile: 0,
  };
  for (const r of rows) counts[r.source] += 1;
  return counts;
}

/**
 * One CSV cell. Quoted always; and a value starting with = + - @ (or a tab /
 * carriage return) is prefixed with an apostrophe, so a name like
 * "=HYPERLINK(...)" typed at checkout cannot run as a formula when an
 * organiser opens the file in a spreadsheet (CSV injection).
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function recipientsCsv(rows: Recipient[]): string {
  const lines = [
    ["email", "name", "source", "locale"].map(cell).join(","),
    ...rows.map((r) =>
      [r.email, r.name, r.source, r.locale].map(cell).join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
