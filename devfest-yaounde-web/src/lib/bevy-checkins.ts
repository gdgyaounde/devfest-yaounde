/**
 * Turning a Bevy attendee export into the SQL that fills `bevy_checkins`
 * (ADR 0099, migration 0047). Pure, so it is tested; the CLI wrapper is
 * scripts/bevy-checkins-sql.ts.
 *
 * Only rows WITH a check-in date count. The output holds email KEYS
 * (SHA-256 of the canonical email), never an email or a name.
 */
import { emailKey } from "@/lib/email-key";

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface BevyImport {
  /** email key → checked-in people registered under it */
  keys: Map<string, number>;
  rows: number;
  checkedIn: number;
  /** Checked-in rows whose email could not be read. */
  skipped: number;
  /**
   * Checked-in rows whose email Bevy MASKED ("j*****@gmail.com"). Bevy does
   * this in some exports; a masked email matches nobody, so these are
   * skipped and the script refuses to write SQL while there are any.
   */
  masked: number;
}

export const EMAIL_COLUMN = "Email";
export const CHECKIN_COLUMN = "Checkin Date (UTC)";

export function readBevyCheckins(csv: string): BevyImport {
  const [header, ...body] = parseCsv(csv);
  if (!header) throw new Error("The CSV is empty.");
  const emailAt = header.indexOf(EMAIL_COLUMN);
  const checkinAt = header.indexOf(CHECKIN_COLUMN);
  if (emailAt < 0 || checkinAt < 0) {
    throw new Error(
      `Expected Bevy's "${EMAIL_COLUMN}" and "${CHECKIN_COLUMN}" columns; found: ${header.join(", ")}`,
    );
  }
  const keys = new Map<string, number>();
  let checkedIn = 0;
  let skipped = 0;
  let masked = 0;
  for (const row of body) {
    if (!(row[checkinAt] ?? "").trim()) continue;
    checkedIn++;
    if ((row[emailAt] ?? "").includes("*")) {
      masked++;
      continue;
    }
    const key = emailKey(row[emailAt]);
    if (!key) {
      skipped++;
      continue;
    }
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  return { keys, rows: body.length, checkedIn, skipped, masked };
}

/**
 * The SQL to paste into Supabase. It REPLACES the table's contents, so
 * re-running it with a newer export is safe; one transaction, so it lands
 * whole or not at all.
 */
export function bevyCheckinsSql(data: BevyImport, source: string): string {
  const values = [...data.keys]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, people]) => `  ('${key}', ${people})`);
  return [
    `-- Bevy check-ins for the pitch vote (ADR 0099), generated from ${source}.`,
    `-- ${data.rows} registrations, ${data.checkedIn} checked in, ${data.keys.size} distinct emails` +
      (data.skipped ? `, ${data.skipped} unreadable emails skipped` : "") +
      ".",
    "-- Holds email KEYS only (SHA-256 of the canonical email), no emails or names.",
    "-- Run in the Supabase SQL editor after migration 0047. Replaces any earlier import.",
    "begin;",
    "delete from public.bevy_checkins;",
    ...(values.length
      ? [
          "insert into public.bevy_checkins (email_key, people) values",
          values.join(",\n") + ";",
        ]
      : []),
    "commit;",
    "",
  ].join("\n");
}
