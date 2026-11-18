# 0087 — Anonymous testimonials and the wall's Stories

Date: 2026-11-18
Status: Accepted

## Context

The team wants people to leave a few words about what DevFest Yaoundé has meant to them, anonymously, and to replay those words as a story of the years, on the same screen as the community wall.

## Decision

- **Writing:** `/testimonial` (both locales). One screen with no site chrome, no scroll and no splash. A greeting fades in and gives way to one large text field. Tap anywhere to type. The message is 20–280 characters; the home page's own testimonials run 80–175. Role is optional, from attendee / speaker / volunteer / organiser / sponsor / partner, or Other typed by hand. Edition is optional, from 2016–2026, or Other. Motion uses the new calm presets (`calmIn`, `calmBreathe`, `calmFade` in `motion.css`), all disabled under reduced motion.
- **Storage:** table `testimonials` (migration 0039). It holds only the message, role, edition, locale and status. No name, account, email or IP is stored. RLS is on with no policies.
- **Abuse:** same-origin only, 5 per hour per IP (the address is used only for the counter), and a honeypot field.
- **Moderation:** every submission is `pending`. Admin → Testimonials → Submissions has Approve, "Don't show" / "Take off the wall", and Delete, all audited, plus a copy-link button.
- **Display:** the wall gets a Cards / Stories switch in its navbar (`/wall?view=stories`). Stories shows approved testimonials one at a time with a long cross-fade. The faint year sits behind each one. Oldest edition plays first, undated ones last, then the reel loops. It refreshes every minute. There is no separate public page for reading them.

## Consequences

- Before 0039 is applied, the form answers "not available" and Stories shows its empty state.
- The home page's testimonials (the editorial `quotes` collection) are unchanged. Promoting a submission there is a manual copy for now.
