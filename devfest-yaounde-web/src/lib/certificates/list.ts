/**
 * The "Certificates list" export (ADR 0100): everyone the site knows was
 * THERE, in the exact columns of the certificates sheet, ready to paste.
 * Pure, so the rules are tested without a database.
 *
 * One row per (person, role) — someone who spoke and organised gets two
 * certificates. Rows are keyed by email when there is one, else by name.
 *
 *   - attendee   — every CHECKED-IN ticket (its attendee), and every
 *                  checked-in, not-cancelled reservation (its contact person);
 *   - volunteer  — every day-of volunteer account;
 *   - speaker    — every speaker marked "arrived" at the speaker station,
 *                  with their session titles as the detail; no email (the
 *                  site doesn't hold speakers' emails — fill it in the sheet);
 *   - organiser  — every visible team member, their role as the detail; no
 *                  email either.
 *
 * Free passes were checked in on Bevy, outside the site: they are added to
 * the sheet from Bevy's own export.
 */
import type { CertificateRole } from "@/lib/certificates/rules";

export interface CertificateListRow {
  full_name: string;
  email: string;
  role: CertificateRole;
  detail: string;
  source: string;
}

/** The sheet's columns, in order — the Apps Script reads them by name. */
export const CERTIFICATE_LIST_COLUMNS = [
  "full_name",
  "email",
  "role",
  "detail",
  "source",
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const lowerEmail = (v: unknown) => {
  const e = clean(v).toLowerCase();
  return EMAIL.test(e) ? e : "";
};
/** "JEAN DUPONT" → "Jean Dupont"; mixed-case names are left as typed. */
export function tidyName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name;
  return name
    .toLowerCase()
    .replace(
      /(^|[\s'’-])(\p{L})/gu,
      (_, sep: string, c: string) => sep + c.toUpperCase(),
    );
}

export function buildCertificateList(input: {
  tickets: {
    attendee_name: string;
    attendee_email: string;
    checked_in_at: string | null;
  }[];
  reservations: {
    contact_name: string;
    contact_email: string | null;
    status: string;
    checked_in_at: string | null;
  }[];
  volunteers: { name: string | null; email: string | null }[];
  speakers: { name: string; arrived: boolean; sessionTitles: string[] }[];
  team: { name: string; role: string }[];
}): CertificateListRow[] {
  const out = new Map<string, CertificateListRow>();
  const add = (row: CertificateListRow) => {
    const full_name = tidyName(row.full_name);
    if (!full_name) return;
    const key = `${row.role}|${row.email || `name:${full_name.toLowerCase()}`}`;
    if (out.has(key)) return;
    out.set(key, { ...row, full_name });
  };

  for (const t of input.tickets) {
    if (!t.checked_in_at) continue;
    add({
      full_name: clean(t.attendee_name),
      email: lowerEmail(t.attendee_email),
      role: "attendee",
      detail: "",
      source: "ticket",
    });
  }
  for (const r of input.reservations) {
    if (!r.checked_in_at || r.status === "cancelled") continue;
    add({
      full_name: clean(r.contact_name),
      email: lowerEmail(r.contact_email),
      role: "attendee",
      detail: "",
      source: "reservation",
    });
  }
  for (const v of input.volunteers) {
    add({
      full_name: clean(v.name),
      email: lowerEmail(v.email),
      role: "volunteer",
      detail: "",
      source: "volunteer",
    });
  }
  for (const s of input.speakers) {
    if (!s.arrived) continue;
    add({
      full_name: clean(s.name),
      email: "",
      role: "speaker",
      detail: s.sessionTitles.map(clean).filter(Boolean).join(" · "),
      source: "speaker",
    });
  }
  for (const m of input.team) {
    add({
      full_name: clean(m.name),
      email: "",
      role: "organiser",
      detail: clean(m.role),
      source: "team",
    });
  }

  const order: CertificateRole[] = [
    "organiser",
    "speaker",
    "volunteer",
    "attendee",
    "partner",
  ];
  return [...out.values()].sort(
    (a, b) =>
      order.indexOf(a.role) - order.indexOf(b.role) ||
      a.full_name.localeCompare(b.full_name, "fr"),
  );
}
