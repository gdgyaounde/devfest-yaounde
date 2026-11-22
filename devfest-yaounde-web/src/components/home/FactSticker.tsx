"use client";

import { useEffect, useRef } from "react";
import { drawStickerBadge } from "@/lib/dp/compose";

/**
 * One of the DP generator's own shape stickers, drawn on a canvas as a bold
 * badge — the accent on a hotspot card (ADR 0098), picked to match what the
 * card says. It is filled with the THEME's primary colour (the footer's
 * switcher), read from `--color-primary`, and redrawn whenever the theme
 * changes — a canvas can't follow a CSS variable on its own. Drawn at 2×
 * for retina.
 */
export function FactSticker({
  id,
  size = 56,
  className = "",
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const root = document.documentElement;
    const draw = () => {
      const accent = getComputedStyle(root)
        .getPropertyValue("--color-primary")
        .trim();
      drawStickerBadge(canvas, id, size * 2, accent || "#F9AB00");
    };
    draw();
    const mo = new MutationObserver(draw);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, [id, size]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
