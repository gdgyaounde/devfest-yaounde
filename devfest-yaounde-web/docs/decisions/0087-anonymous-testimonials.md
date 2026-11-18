# 0087 — Anonymous testimonials and the wall's Stories

Date: 2026-11-18
Status: Accepted

## Context

The team wants people to leave a few words about what DevFest Yaoundé has meant to them, anonymously, and to replay those words as a story of the years, on the same screen as the community wall.

## Decision

- **Writing:** `/storytime` (both locales). One screen with no site chrome, no scroll and no splash, over a gentle version of the hero's dot field (`PreloaderDots` with `base`/`peak` lowered), which fades in (`calmAppear`) rather than being there on the first frame. A storybook intro plays first: "Once upon a time, in Yaoundé…", the years counting 2016 → 2026 (ease-in-out: slow, fast through the middle, slow again; the digits start spread across the room the screen has — measured, not fixed — and draw together as they count, growing heavier as they count — a text stroke in the text's own colour, not font-weight, so 2026 lands heavier than the font's boldest cut — then pinch tight on the last year and loosen gently — one continuous spacing curve with no phase boundaries, so it never breaks or lags), "…a community grew, one story at a time.", and then the question itself, "What has DevFest Yaoundé meant to you?", large in the middle of the screen and in sentence case. It then shrinks into its place above the field (a FLIP measured from the text box) while scrambling into its uppercase label (`useScramble` gained `from`, `stagger` and `churn`). Monospace, so the case change never changes the width. The field is focused only once it has faded in, so its border is seen drawing from the first stroke, with a strong ease-in-out (quart, 1.5 s). Four cursors (the site's own rounded arrow, without the pinned dot or follower) in the brand colours, each named after a role, act out how an edition comes together. They join one at a time (organiser, volunteer, speaker, attendee), each flying in from outside the screen from its own side or corner. Each moves its own way (circling, figure-eights, pacing the top, wandering). As the question appears they leave in reverse, off-screen, and the organiser is last out. One line shows at a time and words surface from a blur. Tap or press a key to skip; it doesn't play under reduced motion. Then a centred field with no background and no border until it takes focus, when one solid line draws itself around it from start to finish (SVG `pathLength` + `stroke-dashoffset`). It grows with the text, up to 46% of the screen's height. Past that the type steps down (never below 15px) so the story always fits. There is never a scrollbar, and both the growth and the type change ease. Type is tracked slightly tight (−0.02em). The message is 20–280 characters. Role and edition are optional pill pickers (a small sheet of pills, with "Other…" turning into a text field), not native selects. Motion presets: `calmIn`, `calmFade`, `storyWord`, `storyGrow`.
- **Storage:** table `testimonials` (migration 0039). It holds only the message, role, edition, locale and status. No name, account, email or IP is stored. RLS is on with no policies.
- **Abuse:** same-origin only, 5 per hour per IP (the address is used only for the counter), and a honeypot field.
- **Moderation:** every submission is `pending`. Admin → Testimonials → Submissions has Approve, "Don't show" / "Take off the wall", and Delete, all audited, plus a copy-link button.
- **Display:** the wall gets a Cards / Stories switch in its navbar (`/wall?view=stories`). Stories has its own banner line and shows approved testimonials one at a time with a long cross-fade. The faint year sits behind each one. Oldest edition plays first, undated ones last, then the reel loops. It refreshes every minute. There is no separate public page for reading them.

## Consequences

- Before 0039 is applied, the form answers "not available" and Stories shows its empty state.
- The home page's testimonials (the editorial `quotes` collection) are unchanged. Promoting a submission there is a manual copy for now.
