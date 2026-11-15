# 0078 — The door check-in scanner

Date: 2026-11-15
Status: Accepted

## Context

`POST /api/check-in` has existed since the payments phase, organiser-gated and
race-safe, but nothing called it: there was no screen a volunteer could use at
the door (issue #38, gap G5). DevFest Yaoundé 2026 is one day, Saturday 21 Nov,
with paid passes whose perks (meal, swag) are handed out on site.

Constraints that shaped it:

- Volunteers use their own phones — Android and iPhone — on venue Wi-Fi.
- `/admin` renders the whole dashboard in one request (every list, up front).
  Right for a laptop, wrong for a phone in a queue.
- The site sends `Permissions-Policy: camera=()` on every response, so no page
  could open the camera at all.
- Refunds are tracked in `refund_requests`, matched to tickets by free-text
  reference; a refunded ticket still exists and still has a valid badge code.

## Decision

1. **Its own route, `/{locale}/admin/check-in`**, under the existing admin
   layout gate (non-organisers get a 404). It loads the tier names and
   nothing else. Linked from the top of the admin sidebar. English only, like
   the rest of the dashboard.

2. **Camera decoding: the native `BarcodeDetector` first, `jsQR` as the
   fallback.** Chrome on Android has `BarcodeDetector`; Safari on iPhone does
   not. `jsqr` (Apache-2.0, no dependencies) is added as a dependency and is
   imported dynamically, so only phones without a native detector download
   it — it is never in the shared bundle. Frames are sampled every 180 ms and
   downscaled to 640 px before decoding.

3. **Camera allowed on that route only.** `next.config.ts` keeps
   `camera=()` for every path and adds a later, narrower header entry for
   `/:locale(fr|en)/admin/check-in` with `camera=(self)`. Next applies the
   last matching entry for a key, so the scanner — and nothing else — can ask.

4. **One scan, one request.** A result pauses scanning. A clean success
   resumes on its own after 2.2 s; anything that needs a decision waits for
   "Scan next". The badge just handled is ignored for 8 s after resuming, so a
   badge held in front of the camera is not reported as "already checked in"
   a second later.

5. **Typed codes are normalised** (`normaliseBadgeCode`): case, spaces and
   dashes ignored; O → 0, I/L → 1, since the alphabet omits those letters.
   The API uses the same function, so the screen and the server can never
   disagree about what a valid code is.

6. **Refunds warn, they never refuse.** The API now looks up refund requests
   for the ticket (its id, badge code or order) alongside the check-in and
   returns `refund: "refunded" | "pending"`. A free pass gets anyone in
   (ADR 0074), so a refunded ticket is a free pass: the volunteer is told "no
   meal or swag", not to turn the person away. The lookup fails open — a
   database hiccup drops the warning, never the queue — and is logged.

7. **No offline queue.** A queued scan admits someone nobody verified, and two
   offline phones would both admit the same badge. Offline is shown plainly;
   a network failure keeps the code for a retry, and a printed ticket export
   is the documented fallback.

## Consequences

- Volunteers need an organiser account; adding one is a row in `organisers`
  and takes effect immediately.
- The scan counter and "recent scans" list are per phone and in memory only;
  attendee names never reach storage on the device.
- Bevy-only free RSVPs have no badge and cannot be scanned — by design, since
  a free pass does not need one to get in.
- If another feature ever needs the camera, it gets its own scoped header
  entry; the site-wide `camera=()` stays.
- Torch control appears only where the browser exposes it (mostly Android).
