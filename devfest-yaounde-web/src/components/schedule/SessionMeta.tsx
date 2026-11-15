"use client";

import {
  Coffee,
  GlobeHemisphereWest,
  Lightning,
  Microphone,
  Rocket,
  Translate,
  UsersThree,
  WifiHigh,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import type { Session, SessionKind } from "@/data/types";

export const KIND_ICON: Record<SessionKind, typeof Microphone> = {
  talk: Microphone,
  workshop: Rocket,
  panel: UsersThree,
  break: Coffee,
};

const KIND_LABEL_KEY: Record<SessionKind, string> = {
  talk: "kindTalk",
  workshop: "kindWorkshop",
  panel: "kindPanel",
  break: "kindBreak",
};

/**
 * A session's facts as chips — format, Online, level, language (ADR 0073).
 *
 * ONE implementation for the schedule card and the speaker profile, so the
 * two can never describe the same talk differently. Every chip is icon +
 * text: none of these facts is carried by colour alone.
 *
 * `tone` matches the surface: `light` on the pastel schedule cards and the
 * mobile bottom sheet, `dark` on the speaker popover / slider scrim.
 */
export function SessionMeta({
  session,
  tone = "light",
}: {
  session: Session;
  tone?: "light" | "dark";
}) {
  const t = useTranslations("home.schedule");
  const locale = useLocale() as "fr" | "en";
  const dark = tone === "dark";

  const chip = `inline-flex items-center gap-1.5 rounded-pill border-2 px-3 py-1 font-mono text-mono-tag font-bold uppercase tracking-wide ${
    dark
      ? "border-offwhite/40 text-offwhite"
      : "border-black02 bg-offwhite text-black02"
  }`;
  /* The format chip is the loud one — filled, in the brand yellow. */
  const lead = `inline-flex items-center gap-1.5 rounded-pill border-2 px-3 py-1 font-mono text-mono-tag font-bold uppercase tracking-wide ${
    dark
      ? "border-primary bg-primary text-black02"
      : "border-black02 bg-offwhite text-black02"
  }`;

  const KindIcon = session.lightning ? Lightning : KIND_ICON[session.kind];
  const languages = session.language ?? [];

  return (
    <ul className="flex flex-wrap items-center gap-2">
      <li className={lead}>
        <KindIcon size={14} weight="duotone" aria-hidden />
        {session.lightning
          ? t("lightning")
          : t(KIND_LABEL_KEY[session.kind] as "kindTalk")}
      </li>
      {session.online && (
        <li className={chip} title={t("onlineHint")}>
          <WifiHigh size={14} weight="bold" aria-hidden />
          {t("online")}
        </li>
      )}
      {session.level && (
        <li className={chip}>
          <span className="sr-only">{t("levelLabel")}: </span>
          {t(`level.${session.level}`)}
        </li>
      )}
      {languages.length > 0 && (
        <li className={chip}>
          <Translate size={14} weight="bold" aria-hidden />
          {/* Visible as "FR · EN"; read aloud as "Given in French, English". */}
          <span aria-hidden>
            {languages.map((l) => l.toUpperCase()).join(" · ")}
          </span>
          <span className="sr-only">
            {t("languageLabel")}{" "}
            {languages.map((l) => t(`languageName.${l}`)).join(", ")}
          </span>
        </li>
      )}
      {session.originalLanguage && session.originalLanguage !== locale && (
        <li
          className={`inline-flex items-center gap-1.5 font-mono text-caption ${
            dark ? "text-offwhite/65" : "text-black02/65"
          }`}
        >
          <GlobeHemisphereWest size={14} weight="bold" aria-hidden />
          {t("originalLanguage", { language: session.originalLanguage })}
        </li>
      )}
    </ul>
  );
}
