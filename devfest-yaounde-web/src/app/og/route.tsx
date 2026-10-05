import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { loadSettings } from "@/lib/content/settings";
import { EVENT, formatEventDates } from "@/lib/event";

/**
 * The branded social card, rendered on demand.
 *
 * `/og?title=…&subtitle=…` — one route for every page, because the headline
 * is the only thing that differs and a dozen hand-made PNGs would drift from
 * the brand the first time a colour moved.
 *
 * FLAT FILLS ONLY, like everything else (DESIGN.md §2.6). It is deliberately
 * the DEFAULT yellow rather than the visitor's chosen theme — the image is
 * baked once and cached by whoever unfurls the link, so it cannot follow a
 * per-visitor setting, and pretending otherwise would just make the cache lie.
 *
 * ## This route returned a 500 for a day, and the reason is not what it looked
 * ## like
 *
 * Every request failed with `Cannot read properties of undefined (reading
 * 'trim')`. The obvious suspect was the inline `<svg><path>` stickers that
 * had just been added, so they were removed. **It kept failing**, because
 * they were never the cause.
 *
 * The cause was a style object carrying `left: undefined` — the offsets a
 * shape does not set. Satori treats every style value as a string and calls
 * `.trim()` on it, so a property present with an `undefined` value throws,
 * while the same property simply absent is fine. A browser ignores
 * `left: undefined` silently, which is why it read as correct twice.
 *
 * Established by rendering the route directly in a script and bisecting, not
 * by reasoning about it. Inline SVG and SVG data URIs both turned out to work
 * — the ban on them was a wrong conclusion drawn from a coincidence, and is
 * recorded here so nobody re-derives it.
 *
 * What matters for this file:
 *
 *   - **never pass `undefined` as a style value.** Omit the key.
 *   - **every asset read is wrapped**, so a missing file costs the logo and
 *     not the whole image;
 *   - every element with more than one child carries `display: flex`, which
 *     satori requires and does not infer.
 *
 * And the failure mode is worth remembering: an Open Graph route is only ever
 * fetched by someone else's crawler, so a 500 here is invisible from the site.
 * Nothing looked broken. The card had simply stopped existing.
 */
export const runtime = "nodejs";

/**
 * The eyebrow line, from the one list that holds the dates.
 *
 * It used to read "DEVFEST YAOUNDÉ 2026 · 21–22 NOV" — typed by hand, and
 * wrong in the way ADR 0038 fixed everywhere else. A social card is the worst
 * place for a stale date: it is cached by whoever unfurls the link, so the
 * wrong one keeps being served long after the site is right.
 *
 * `locale` picks the language the CARD is in. Uppercased here rather than
 * with `text-transform`, which satori does not implement.
 */
function eyebrow(locale: "fr" | "en", eventDate: string): string {
  const dates = formatEventDates(locale, [eventDate]);
  /*
    WHEN and WHERE — not the event's name, which is the headline directly
    below it in type three times the size. Repeating it there cost a line:
    "DEVFEST YAOUNDÉ · 21 & 28 NOVEMBER 2026" wrapped onto two rows and
    pushed the card's whole text column down.

    Falls back to the year when no date is confirmed, because then nothing
    else on the card says which edition this is.
  */
  const where = EVENT.venue ?? EVENT.city;
  return (
    dates ? `${dates} · ${where}` : `${EVENT.name} ${EVENT.year}`
  ).toUpperCase();
}

const YELLOW = "#F9AB00";
const BLUE = "#4285F4";
const GREEN = "#34A853";
const RED = "#EA4335";
const INK = "#1E1E1E";
const PAPER = "#F0F0F0";

/**
 * The mark, as PNG halves.
 *
 The two PNGs sit side by side to form the mark, and they are the file
 * `event.ts` already publishes as the organisation logo in structured data —
 * so this is the mark search engines and social cards agree on.
 *
 * `devfest-logo.svg` would also work: the SVG data URI was tested and renders
 * fine. PNG is kept because it is the asset the rest of the metadata already
 * points at, not because SVG is a hazard — see the note at the top of the
 * file, which corrects an earlier claim that it was.
 *
 * Read once per warm function, embedded rather than linked: the renderer has
 * no origin to resolve a relative path against, and pointing it at the live
 * site would make a social card depend on the site being up to describe the
 * site.
 */
let markPromise: Promise<[string, string] | null> | null = null;
function devfestMark(): Promise<[string, string] | null> {
  markPromise ??= Promise.all([
    readFile(join(process.cwd(), "public/logo/d-logo-left.png")),
    readFile(join(process.cwd(), "public/logo/d-logo-right.png")),
  ])
    .then(
      ([left, right]) =>
        [
          `data:image/png;base64,${left.toString("base64")}`,
          `data:image/png;base64,${right.toString("base64")}`,
        ] as [string, string],
    )
    .catch(() => null);
  return markPromise;
}

/**
 * The confetti.
 *
 * Flat shapes in the four Google colours, at fixed positions — this is the
 * "a room full of people building things" energy the card is meant to carry,
 * and it is the same vocabulary as the site's own decoration: plain shapes,
 * heavy ink outlines, no gradients.
 *
 * Fixed rather than random, because the image is cached by every service that
 * unfurls the link: "random" would only mean "whichever roll happened the
 * first time anyone shared this page".
 */
const CONFETTI: {
  key: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  w: number;
  h: number;
  radius: number;
  fill: string;
  rotate: number;
}[] = [
  {
    key: "a",
    top: 96,
    right: 96,
    w: 84,
    h: 84,
    radius: 999,
    fill: BLUE,
    rotate: 0,
  },
  {
    key: "b",
    top: 214,
    right: 208,
    w: 62,
    h: 62,
    radius: 16,
    fill: RED,
    rotate: 18,
  },
  {
    key: "c",
    top: 268,
    right: 74,
    w: 120,
    h: 26,
    radius: 999,
    fill: GREEN,
    rotate: -12,
  },
  {
    key: "d",
    top: 352,
    right: 168,
    w: 48,
    h: 48,
    radius: 999,
    fill: INK,
    rotate: 0,
  },
  {
    key: "e",
    bottom: 132,
    right: 110,
    w: 92,
    h: 92,
    radius: 24,
    fill: PAPER,
    rotate: -9,
  },
  {
    key: "f",
    bottom: 96,
    right: 250,
    w: 54,
    h: 54,
    radius: 999,
    fill: RED,
    rotate: 0,
  },
  {
    key: "g",
    top: 150,
    right: 300,
    w: 30,
    h: 108,
    radius: 999,
    fill: INK,
    rotate: 22,
  },
  // Nothing on the left. Two shapes were tried there for balance and both
  // landed on the subtitle and the domain — the text column runs to roughly
  // x=820, so "the empty side" is not empty, it is where the words are.
  // A lopsided cluster beats a shape sitting on a sentence.
];

export async function GET(request: NextRequest) {
  const settings = await loadSettings();
  const { searchParams } = new URL(request.url);
  // Clamped: a long description pasted in would otherwise overflow the card.
  const title = (searchParams.get("title") ?? "DevFest Yaoundé").slice(0, 90);
  // The card is rendered per link, so it can honour the locale of the page
  // that asked for it — a French page should not unfurl in English.
  const locale = searchParams.get("locale") === "en" ? "en" : "fr";
  const subtitle = (searchParams.get("subtitle") ?? "").slice(0, 130);
  const mark = await devfestMark();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: YELLOW,
        padding: 64,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {CONFETTI.map((shape) => (
        <div
          key={shape.key}
          style={{
            position: "absolute",
            display: "flex",
            /*
             * OMIT the offsets a shape does not set. Do not pass `undefined`.
             *
             * This one line is what broke the card. Satori reads every style
             * value as a string and calls `.trim()` on it, so a property
             * present with an `undefined` value throws
             * `Cannot read properties of undefined (reading 'trim')` — while
             * the same property simply absent is fine. A browser ignores
             * `left: undefined` without a murmur, which is why it survived
             * review twice.
             *
             * It fails as a 500 on a route only ever fetched by someone
             * else's crawler, so nothing on the site looked wrong: the social
             * card just stopped existing. Verified by rendering the route
             * directly rather than by reading it.
             */
            ...(shape.top !== undefined ? { top: shape.top } : {}),
            ...(shape.right !== undefined ? { right: shape.right } : {}),
            ...(shape.bottom !== undefined ? { bottom: shape.bottom } : {}),
            ...(shape.left !== undefined ? { left: shape.left } : {}),
            width: shape.w,
            height: shape.h,
            borderRadius: shape.radius,
            background: shape.fill,
            border: `6px solid ${INK}`,
            transform: `rotate(${shape.rotate}deg)`,
          }}
        />
      ))}

      {/* The chapter, with the mark. Who is writing comes before what about. */}
      <div style={{ display: "flex" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            background: INK,
            color: PAPER,
            padding: "14px 30px",
            borderRadius: 999,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          {mark ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mark[0]} width={22} height={25} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mark[1]} width={22} height={25} alt="" />
            </div>
          ) : null}
          GDG YAOUNDÉ
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxWidth: 820,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 2,
            color: INK,
            opacity: 0.72,
          }}
        >
          {eyebrow(locale, settings.eventDate)}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 34 ? 76 : 104,
            lineHeight: 1.02,
            fontWeight: 700,
            color: INK,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              display: "flex",
              fontSize: 30,
              lineHeight: 1.3,
              color: INK,
              opacity: 0.75,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            width: 88,
            height: 16,
            background: INK,
            borderRadius: 999,
          }}
        />
        <div style={{ display: "flex", fontSize: 28, color: INK }}>
          devfest.gdgyaounde.com
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
