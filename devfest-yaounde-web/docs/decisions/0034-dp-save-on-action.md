# 0034 — Download, share and copy save the composed card

Date: 2026-09-04
Status: Accepted — **supersedes 0015**; amends 0021 / 0026 / 0033 on how a
card reaches the wall

## Context

`0015` decided the DP generator never uploaded a photo: compositing stayed on
the device, and a public gallery was impossible without a new record. `0021`
opened a narrow hole — one opt-in, per-card upload of a smaller copy.

Phase 18 asked for a different product: pressing **Download, Share or Copy**
saves a copy first, then does the action. The action still succeeds if the
save fails. The old "photo never leaves your device" block would have been a
lie.

## Decision

**The composed card may leave the device, on those three actions, after an
upfront notice.** The raw source photo still never uploads. What is stored is
the same 640px JPEG the wall already used (`0026`): no EXIF, private bucket,
signed URLs, re-encoded on the server.

The record is `id`, image path, nickname, created-at, `theme` (the frame id),
`visible` (default on), plus the existing consent timestamp and wording. A
card is public while `status = approved` and `visible = true`. Auto-approval
(`0027`) still applies; `visible` is how an organiser hides one without
destroying the file (Part B9). A submitter takedown still **deletes**.

Consent is the notice sitting above the buttons, with a link to
`/wall/terms`. The server records that wording (`galleryConsentText`), never
a client-supplied string. There is no second "put it on the wall" click —
the action _is_ the save.

Retention remains 200 days (`gallery-retention.ts`). Report (`0033`) and
token takedown stay. `/wall/remove` lists cards this browser saved.

Share captions now include `@gdgyaounde` (Phase 18; amends G16). Per-network
intent buttons are gone; Web Share for the image remains.

## Consequences

- `0015`'s "nothing is uploaded" is no longer true of the _card_. It remains
  true of the source photo.
- A download can put a face on the public wall before anyone looks. That is
  the default-on trade already accepted in `0027`, now on every save rather
  than an opt-in. Approve-first is still `DP_GALLERY_REVIEW=1`.
- Rate limit on `POST /api/dp/gallery` is 12/hour: iterating a card should
  not stall the download, which skips the save once the bucket is full.
- Empty walls show a "be the first" state, not labelled placeholders.
