/**
 * Event certificates (ADR 0100) — the rules shared by the issue API, the
 * verify page, the QR code and the dashboard export. Pure, so they are
 * tested without a database.
 *
 * Certificates are made and emailed by the Google Apps Script in
 * `tools/certificates/`; the site only RECORDS each one (no email, ever) so
 * the QR code printed on it can prove it is genuine.
 */
import { z } from "zod";
import { SITE_URL } from "@/lib/site-config";

/**
 * "DFY26-0042": an edition prefix (letters/digits, starting with a letter),
 * a dash, then a running number. The prefix is set per edition in the
 * sheet's Settings, so next year's can be "DFY27".
 */
export const CERTIFICATE_ID = /^[A-Z][A-Z0-9]{1,9}-\d{3,6}$/;

export function isCertificateId(value: unknown): value is string {
  return typeof value === "string" && CERTIFICATE_ID.test(value);
}

/** Normalises what someone typed or scanned: trims, upper-cases. */
export function normaliseCertificateId(raw: string): string {
  return decodeURIComponent(raw).trim().toUpperCase();
}

export const CERTIFICATE_ROLES = [
  "attendee",
  "speaker",
  "volunteer",
  "organiser",
  "partner",
] as const;
export type CertificateRole = (typeof CERTIFICATE_ROLES)[number];

/**
 * What the Apps Script sends when it generates certificates: a batch of
 * records, never an email address. `strict` everywhere, so a field the site
 * does not expect is a refusal, not silently ignored.
 */
export const issueSchema = z
  .object({
    certificates: z
      .array(
        z
          .object({
            id: z.string().regex(CERTIFICATE_ID),
            edition: z.number().int().min(2020).max(2100),
            fullName: z.string().trim().min(1).max(120),
            role: z.enum(CERTIFICATE_ROLES),
            detail: z.string().trim().max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export type IssueRequest = z.infer<typeof issueSchema>;

/**
 * The address the QR code points to. Without a locale on purpose: the site
 * sends the visitor to /fr or /en from their browser's language.
 */
export function verifyUrl(id: string, site: string = SITE_URL): string {
  return `${site.replace(/\/$/, "")}/certificates/${encodeURIComponent(id)}`;
}

/** Constant-time comparison of the shared secret the script sends. */
export function bearerMatches(header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = header.slice("Bearer ".length);
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}
