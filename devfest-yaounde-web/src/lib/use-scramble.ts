"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Glyphs the scramble cycles through. Deliberately ASCII-ish and monospace-y
 * so the churn reads as "decoding" rather than as a different language, and
 * deliberately WITHOUT accented characters — the resolved text supplies those
 * from the real string.
 */
const GLYPHS = "!<>-_\\/[]{}—=+*^?#░▒▓01";

/**
 * Pacing. These numbers are tuned to be WATCHABLE: a glyph is held for
 * several frames before changing, and each character starts later than the
 * one before it, so the resolve sweeps visibly across the word.
 */
const CHURN_FRAMES = 26;
const STAGGER_FRAMES = 4;
const GLYPH_HOLD = 3;
/** Frames the resolved word is held before a looping scramble starts again. */
const LOOP_HOLD = 46;

export interface UseScrambleOptions {
  /** The real text. What it resolves to, and what renders when idle. */
  text: string;
  /**
   * Run forever instead of once.
   *
   * The page titles scramble on click and stop; the preloader has to keep
   * going for as long as it is on screen. Same engine, one flag — the
   * alternative was a second copy of the pacing, the glyph set and the
   * stagger, which is how two things that should look identical drift apart.
   */
  loop?: boolean;
  /**
   * What each character shows BEFORE its turn to churn — Storytime's prompt
   * scrambles from sentence case into uppercase, so the line reads as the
   * question the whole way. Defaults to the resolved text.
   */
  from?: string;
  /** Frames between one character starting and the next (default 4). */
  stagger?: number;
  /** Frames each character churns for (default 26). */
  churn?: number;
}

/**
 * The text-scramble engine, driving any element's `textContent`.
 *
 * It writes to the DOM node directly through rAF rather than setState per
 * frame: a 60fps re-render for the length of a decorative effect is real work
 * for nothing. Because it only needs `textContent`, the same hook drives an
 * HTML `<span>` (the page titles) and an SVG `<text>` (the preloader, where
 * SVG's `textLength` is what stops the line jittering as glyphs change).
 *
 * Reduced motion: nothing ever runs. The text simply stays put.
 */
export function useScramble<T extends Element>({
  text,
  loop = false,
  from,
  stagger = STAGGER_FRAMES,
  churn = CHURN_FRAMES,
}: UseScrambleOptions) {
  const nodeRef = useRef<T>(null);
  const frameRef = useRef<number | null>(null);

  const start = useCallback(() => {
    const node = nodeRef.current;
    if (!node || frameRef.current !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const chars = [...text];
    const before = from ? [...from] : chars;
    // Each character gets its own start/end frame, so the resolve sweeps
    // across the word instead of every letter locking at once.
    const schedule = chars.map((_, i) => ({
      start: i * stagger,
      end: i * stagger + churn,
    }));
    const total = schedule[schedule.length - 1]?.end ?? 0;
    const held = chars.map(() => GLYPHS[0]);
    let frame = 0;

    const tick = () => {
      const out = chars.map((c, i) => {
        // Whitespace never churns — scrambling the gaps makes the word lose
        // its shape and reads as noise rather than as decoding.
        if (c.trim() === "") return c;
        if (frame < schedule[i].start) return before[i] ?? c;
        if (frame >= schedule[i].end) return c;
        if (frame % GLYPH_HOLD === 0) {
          held[i] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        return held[i];
      });
      node.textContent = out.join("");

      if (frame >= total) {
        node.textContent = text;
        if (!loop) {
          frameRef.current = null;
          return;
        }
        // Hold the resolved word, then decode it again from the top.
        if (frame >= total + LOOP_HOLD) frame = -1;
      }
      frame++;
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [text, loop, from, stagger, churn]);

  // Cancel an in-flight scramble if the node unmounts mid-decode, and put the
  // real text back so a remount never inherits a half-decoded string.
  useEffect(() => {
    const node = nodeRef.current;
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (node) node.textContent = text;
    };
  }, [text]);

  return { ref: nodeRef, start };
}
