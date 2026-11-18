"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * On the wall only: switch between the DP cards and the Stories reel
 * (ADR 0087). A link pair rather than state, so a display can be left on
 * `/wall?view=stories` and survives a reload.
 */
export function WallSwitch() {
  const t = useTranslations("pages.wall.switch");
  const stories = useSearchParams()?.get("view") === "stories";
  const item = (active: boolean) =>
    `px-3.5 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide transition-colors duration-200 ${
      active ? "bg-black02 text-offwhite" : "text-black02 hover:bg-pastel"
    }`;
  return (
    <nav
      aria-label={t("label")}
      className="flex shrink-0 overflow-hidden rounded-pill border-2 border-black02"
    >
      <Link
        href="/wall"
        aria-current={!stories ? "page" : undefined}
        className={item(!stories)}
      >
        {t("wall")}
      </Link>
      <Link
        href={{ pathname: "/wall", query: { view: "stories" } }}
        aria-current={stories ? "page" : undefined}
        className={item(stories)}
      >
        {t("stories")}
      </Link>
    </nav>
  );
}
