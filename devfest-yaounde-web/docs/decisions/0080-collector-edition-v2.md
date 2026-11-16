# 0080 — Collector edition, redesigned: three styles, a seal, photo shapes, your own badge

Date: 2026-11-16
Status: Accepted

## Context

The first collector frames (ADR 0077) — gold foil and a ticket stub —
didn't read as collector items: they looked like two more styles, and the
stub printed the holder's tier and a serial number, which nobody asked to
have on their profile picture. The perk needed to feel premium, and to be
more than a colour scheme.

Asked and answered: "custom badge" means both a designed seal and a badge
with the person's own text; the Gemini/wallpaper shapes are a separate
photo-shape picker usable with any style.

## Decision

1. **Three new collector styles**, nothing personal printed:
   Midnight gold (guilloché waves on black, black plate with gold type),
   Constellation (Gemini-style sparkles) and Shapes (big soft Material
   shapes). Old ids `collector-foil` / `collector-stub` are retired; cards
   already on the wall are images and are unaffected.

2. **A collector seal** on every collector-style card: a gold scalloped
   medallion with the edition set round a ring and a sparkle at its heart,
   pinned over the photo's top-right corner. Flat layers only.

3. **One shape engine** (`shapes.ts`) for the sparkle, scalloped/lobed polar
   shapes and rounded polygons, used both for the patterns and as **photo
   masks**. Five photo shapes; their recipes are server-only
   (`collector-shapes.ts`) and come with the collector frames from
   `GET /api/dp/collector-frames`. A shape replaces the edge treatment; it
   gets an ink keyline and the flat offset shadow. Because a shape's curves
   leave far more empty card than a rounded rectangle, a shaped photo's box
   grows into the padding (`SHAPE_GROW`, 0.06 a side, leaving a 0.025 rim);
   pan and zoom are fractions of the box, so the framing carries over, and
   the pan limits use the same grown box. In a portrait box a shape
   stretches at most 18 %.

4. **A typed badge** (≤ 22 characters, control characters stripped) for the
   same people. It is drawn where the preset badge would be.

5. **Wall saves declare the perks they use** (`shape`, `customBadge`) and
   `requireCollectorEntitlement` refuses any of them — like a collector
   style — unless the saver is entitled. The server can only check what a
   submission claims; the image itself is the client's drawing.

## Consequences

- The paid-pass email's line about the frames was updated to match; the
  downloadable templates were regenerated.
- A typed badge can reach the public wall. It is limited to entitled,
  signed-in people (accountable), short, and the wall's existing report and
  moderation tools apply.
- Adding a shape is a recipe plus an id; the tests keep polar shapes from
  cutting into a face.
