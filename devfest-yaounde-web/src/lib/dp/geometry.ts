/**
 * DP generator — the card's layout grid.
 *
 * Everything the compositor draws is positioned from here, so "aligned" is a
 * property of the geometry rather than of whoever last edited a magic number.
 * The crop control imports the same functions, which is what stops the box
 * that moves the photo from drifting away from the box that draws it.
 *
 * NESTED RADII DECREASE INWARD, by exactly the padding between each pair —
 * the standard rule, `outer = inner + padding`. Concentric rounded shapes
 * that all share one radius look wrong, and this card has three levels:
 *
 *   card 0.135W  →  (pad 0.085W)  →  photo 0.050W
 *   photo 0.050W →  (pad 0.035W)  →  plate 0.015W
 *
 * The plate ends up nearly square-cornered, and that is the rule working
 * rather than a mistake: a small element deep inside a very round one is
 * supposed to look like that. Matching the card's radius at every level is
 * what looks wrong.
 *
 * Every length is a fraction of the card's WIDTH, including the vertical
 * ones. That is deliberate: it means a 3:4 card has the same margins and the
 * same type size as a 1:1 card, and simply gets a taller photo, rather than
 * everything stretching with the aspect ratio.
 */

export type DpRatio = "1:1" | "3:4";

/**
 * How the card's corners are cut.
 *
 * `rounded` is the default and the site's own language. `square` and `mixed`
 * are a DELIBERATE EXCEPTION to the no-sharp-corners rule (DESIGN.md §7b),
 * asked for in PHASE16: the rule governs the site's chrome, and this is
 * artwork the visitor is making for themselves. A hard-edged print is a real
 * look, and `mixed` — square outside, rounded inside — is the classic
 * mounted-photo treatment.
 *
 * The nesting rule still applies wherever there is a radius to nest: with a
 * square outer edge there is nothing to subtract from, so the inner radii
 * simply stand on their own.
 */
export type DpCorners = "rounded" | "square" | "mixed";

export const RATIOS: Record<DpRatio, number> = { "1:1": 1, "3:4": 4 / 3 };

/**
 * Outer padding, card edge to photo — the patterned mount.
 *
 * It is this wide (8.5% of the card on every side) because the pattern is
 * half the design. At 5% the photo swallowed the card and eight carefully
 * different styles all came out as the same picture with a differently
 * coloured hairline round it.
 */
export const PAD = 0.085;
/** Photo edge to branding plate. */
export const PLATE_INSET = 0.035;
/** Card corner radius. The other two follow from the padding. */
export const RADIUS_CARD = 0.135;
export const RADIUS_PHOTO = RADIUS_CARD - PAD;
export const RADIUS_PLATE = RADIUS_PHOTO - PLATE_INSET;
/** Height of the branding plate. */
export const PLATE_HEIGHT = 0.235;
/** Padding inside the plate, from its edge to the type. */
export const PLATE_PAD = 0.045;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardLayout {
  width: number;
  height: number;
  /** Radii, already in pixels and already decreasing inward. */
  radius: { card: number; photo: number; plate: number };
  photo: Rect;
  plate: Rect;
  platePad: number;
  /** One unit for every length in the composition. */
  unit: number;
}

/** Pixel height of a card `width` wide at the given ratio. */
export function cardHeight(width: number, ratio: DpRatio): number {
  return Math.round(width * RATIOS[ratio]);
}

export function layoutCard(
  width: number,
  ratio: DpRatio,
  corners: DpCorners = "rounded",
): CardLayout {
  const height = cardHeight(width, ratio);
  const u = width;
  const photo: Rect = {
    x: PAD * u,
    y: PAD * u,
    w: width - 2 * PAD * u,
    h: height - 2 * PAD * u,
  };
  const plateH = PLATE_HEIGHT * u;
  const plate: Rect = {
    x: photo.x + PLATE_INSET * u,
    y: photo.y + photo.h - PLATE_INSET * u - plateH,
    w: photo.w - 2 * PLATE_INSET * u,
    h: plateH,
  };
  return {
    width,
    height,
    radius: {
      card: corners === "rounded" ? RADIUS_CARD * u : 0,
      photo: corners === "square" ? 0 : RADIUS_PHOTO * u,
      plate: corners === "square" ? 0 : RADIUS_PLATE * u,
    },
    photo,
    plate,
    platePad: PLATE_PAD * u,
    unit: u,
  };
}

/**
 * The photo box for a card ONE UNIT WIDE — both numbers in the same unit, so
 * they can be used directly as an aspect ratio and as the divisor that turns
 * pointer travel into pan.
 *
 * Derived from the same constants the compositor draws with, which is what
 * stops the box that moves the photo from drifting away from the box that
 * draws it.
 */
/**
 * How far a SHAPED photo's box grows into the padding, per side, in card
 * units (ADR 0080). A shape's curves leave far more empty card than a
 * rounded rectangle, so it gets more room. PAD is 0.085: 0.06 leaves a rim.
 */
export const SHAPE_GROW = 0.06;

export function photoBoxUnits(
  ratio: DpRatio,
  grow = 0,
): { w: number; h: number } {
  return { w: 1 - 2 * PAD + 2 * grow, h: RATIOS[ratio] - 2 * PAD + 2 * grow };
}
