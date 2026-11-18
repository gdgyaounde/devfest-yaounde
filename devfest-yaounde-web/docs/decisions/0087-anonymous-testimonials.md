# 0087 — Anonymous testimonials and the wall's Stories

Date: 2026-11-18
Status: Accepted

## Context

The team wants people to leave a few words about what DevFest Yaoundé has meant to them, anonymously, and to replay those words as a story of the years, on the same screen as the community wall.

## Decision

- **Writing:** `/storytime` (both locales). One screen with no site chrome, no scroll and no splash, over a gentle version of the hero's dot field (`PreloaderDots` with `base`/`peak` lowered). A storybook intro plays first: "Once upon a time, in Yaoundé…", the years counting 2016 → 2026, "…a community began to write its story.", "Now, it's your turn." One line shows at a time and words surface from a blur. Tap or press a key to skip; it doesn't play under reduced motion. Then a centred, bordered field that lights up on focus and grows with the text; long stories step the type down a size instead of scrolling. The message is 20–280 characters. Role and edition are optional pill pickers (a small sheet of pills, with "Other…" turning into a text field), not native selects. Motion presets: `calmIn`, `calmFade`, `storyWord`, `storyGrow`.
- **Storage:** table `testimonials` (migration 0039). It holds only the message, role, edition, locale and status. No name, account, email or IP is stored. RLS is on with no policies.
- **Abuse:** same-origin only, 5 per hour per IP (the address is used only for the counter), and a honeypot field.
- **Moderation:** every submission is `pending`. Admin → Testimonials → Submissions has Approve, "Don't show" / "Take off the wall", and Delete, all audited, plus a copy-link button.
- **Display:** the wall gets a Cards / Stories switch in its navbar (`/wall?view=stories`). Stories has its own banner line and shows approved testimonials one at a time with a long cross-fade. The faint year sits behind each one. Oldest edition plays first, undated ones last, then the reel loops. It refreshes every minute. There is no separate public page for reading them.

## Consequences

- Before 0039 is applied, the form answers "not available" and Stories shows its empty state.
- The home page's testimonials (the editorial `quotes` collection) are unchanged. Promoting a submission there is a manual copy for now.
