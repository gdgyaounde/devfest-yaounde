# 0090 — An offline backup list for the door, and a guide volunteers must confirm first

Date: 2026-11-20
Status: Accepted (builds on ADR 0079, 0084, 0089)

## Context

With no signal at the venue the door stops: a scan with no connection cannot know whether a badge or a meal was already used, and the only fallback was a printed CSV. Organisers wanted that fallback on the phone, reachable offline. Separately, volunteers should read the guide before touching the tools.

## Decision

- **Offline backup list (read-only).** `GET /api/staff/backup-list` returns the roster (name, pass, badge code, whether checked in, refund standing; for reservations: reference, name, status, cash owed). Never an email, a phone or anything from a payment. Staff only, 8 downloads an hour each, never cached, and every download is audited with row counts. The phone keeps it in its own storage (`devfest:backup-list:v1`), refreshes it quietly from the tools page when older than 20 minutes, and deletes it when it expires (a volunteer's access end; the day after the event for an organiser) or the server says the person is no longer staff. `/volunteer/backup` searches it on the device by name (accents ignored), ticket code or reservation reference, says clearly that it is a snapshot (not live) and that free Bevy passes are not on it, and has a "remove from this phone" button. It cannot check anyone in.
- **Offline page.** The service worker keeps ONE staff page for offline use, the backup page's data-free shell. A visitor who is not staff gets a 404 for it, which is never cached.
- **Welcome pop-up and guide first.** A new volunteer lands on the guide, where a once-only, light-hearted welcome pop-up carries the four serious points (read the guide, the phone is the tool, call an organiser when unsure, data care). A volunteer opening `/volunteer` is sent to the guide until they tick "I have read and understood the guide" and press Unlock. That sets a cookie holding their own user id (3 days; a handed-over phone asks again) and writes `staff.guide_ack` to the audit log. The tools, team list and backup list redirect to the guide until then. Organisers are exempt. This is a courtesy, not a security boundary: the station APIs do not look at it.
- **The guide's table of contents** sits sticky in the left margin from `lg`, with the current section highlighted; chips on phones.

## Consequences

- A downloaded roster means names and ticket codes live on volunteer phones; it expires with their access and can be removed, and the downloads are audited and scarce. A printed list carries the same data.
- Check-ins made after the last refresh are not shown; the screen says so.
- Free passes taken on Bevy are not in the system, so they are not on the list.
