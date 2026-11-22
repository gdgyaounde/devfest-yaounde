/**
 * The key a Bevy check-in is stored under (ADR 0099, migration 0047): a
 * SHA-256 of the CANONICAL email, so the database never holds the email.
 *
 * MUST match `public.pitch_vote_email_key` in migration 0047 exactly —
 * tests/db/pitch-votes.db.ts hashes the same addresses both ways and
 * compares. Node only (the import script and tests); the app never needs it.
 */
import { createHash } from "node:crypto";

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * Lower-cased and trimmed; for Gmail also without dots and "+tags" in the
 * local part (Google ignores both, and people type them inconsistently).
 * `null` for anything that isn't shaped like an email.
 */
export function canonicalEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
  let [local, domain] = email.split("@") as [string, string];
  if (GMAIL.has(domain)) {
    local = local.split("+")[0].replaceAll(".", "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

export function emailKey(raw: string | null | undefined): string | null {
  const email = canonicalEmail(raw);
  return email
    ? createHash("sha256").update(email, "utf8").digest("hex")
    : null;
}
