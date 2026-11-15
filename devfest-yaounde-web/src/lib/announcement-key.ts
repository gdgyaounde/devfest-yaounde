/**
 * The sessionStorage key a dismissed announcement is remembered under.
 *
 * Keyed by a hash of the TEXT, so dismissing one message never silences the
 * next (ADR 0072). FNV-1a, 32-bit: not security, just a short stable id —
 * the same text always gives the same key, a different text a different one.
 */
export function announcementDismissKey(message: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < message.length; i++) {
    hash ^= message.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `devfest-announcement-dismissed:${(hash >>> 0).toString(36)}`;
}
