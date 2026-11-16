"use client";

import {
  ArrowRight,
  GlobeSimple,
  LinkedinLogo,
  Quotes,
  Sparkle,
  XLogo,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { realSocials } from "@/lib/people-socials";
import { hasText } from "@/lib/sessions";
import { Badge } from "@/components/ui/Badge";
import { SessionMeta } from "@/components/schedule/SessionMeta";
import type { LocalizedString, Session } from "@/data/types";

export interface PersonLike {
  id: string;
  name: string;
  role: LocalizedString;
  /** Speakers have a company; team members don't. */
  company?: string;
  /** Team members have a contribution; speakers don't. */
  contribution?: LocalizedString;
  /** Speakers have a bio; team members have a one-liner. */
  bio?: LocalizedString;
  oneLiner?: LocalizedString;
  /*
   * Optional since the team file holds real organisers rather than invented
   * placeholders — their words are theirs to write, and nothing here will
   * write words for them. Speakers still supply both.
   */
  icebreakerQuestion?: LocalizedString;
  icebreakerAnswer?: LocalizedString;
  funnyMoment?: LocalizedString;
  /** Team only (PHASE23 §B): up to 3 expertise chips and a join year. */
  expertise?: LocalizedString[];
  gdgSince?: number;
  social?: { x?: string; linkedin?: string; website?: string };
  /**
   * Speakers only: their sessions, resolved by the page from `sessionIds`
   * (ADR 0073). Rendered on the full profile, not the home teaser.
   */
  talks?: Session[];
}

/** The person's real profile links, with the client-side icon for each. */
const SOCIAL_ICONS = { x: XLogo, linkedin: LinkedinLogo, website: GlobeSimple };

export function personSocials(p: PersonLike) {
  return realSocials(p).map((social) => ({
    ...social,
    Icon: SOCIAL_ICONS[social.key],
  }));
}

export interface PersonDetailProps {
  person: PersonLike;
  /** "dark" = over a photo scrim; "light" = on a pale surface. */
  tone?: "dark" | "light";
  /** Larger type for the slider's roomier surface. */
  size?: "compact" | "roomy";
  /** Focusable children need tabIndex -1 when the surface is closed. */
  interactive?: boolean;
  /**
   * Show the personality beats — the icebreaker Q&A and the funny moment.
   *
   * Off for the HOME speaker cards (PHASE11 §7): the home page is a teaser,
   * and stacking a bio, a Q&A and a "true story" into a preview card made it
   * cluttered and forced it to scroll. The full personality lives on
   * /speakers, which is where someone has actually asked for it.
   */
  personality?: boolean;
  /**
   * Teaser mode (the home reel): the bio is cut to four lines and a "Full
   * profile" link to this href follows, so a long bio can never push the
   * name and role out of a fixed-height card. The whole bio lives there.
   */
  profileHref?: string;
}

/**
 * The shared person detail block — PHASE9 §1.
 *
 * Renders bio/one-liner, contribution, the icebreaker Q&A and the optional
 * funny moment, so speakers and team members show the same personality
 * fields in the same treatment across the card swipe-up AND the slider.
 *
 * The icebreaker is deliberately styled as a real quote moment (oversized
 * quote mark, answer in display type) rather than a labelled data row —
 * per the brief, it's a warmth beat, not a spec table. The funny moment
 * gets a distinct "true story" chip so it reads as an aside.
 */
export function PersonDetail({
  person,
  tone = "dark",
  size = "compact",
  interactive = true,
  personality = true,
  profileHref,
}: PersonDetailProps) {
  const locale = useLocale() as "fr" | "en";
  const t = useTranslations("common.person");
  const socials = personSocials(person);
  const blurb = hasText(person.bio, locale)
    ? person.bio
    : hasText(person.oneLiner, locale)
      ? person.oneLiner
      : undefined;
  const talks = personality ? (person.talks ?? []) : [];

  const dark = tone === "dark";
  const roomy = size === "roomy";
  const tags = person.expertise ?? [];

  const nameCls = dark ? "text-offwhite" : "text-black02";
  const metaCls = dark ? "text-primary" : "text-black02/70";
  const bodyCls = dark ? "text-offwhite/85" : "text-black02/80";
  const labelCls = dark ? "text-offwhite/55" : "text-black02/65";
  const ruleCls = dark ? "border-offwhite/20" : "border-black02/15";

  return (
    <div
      className={
        roomy
          ? "person-detail-roomy flex flex-col gap-5"
          : "flex flex-col gap-4"
      }
    >
      <div>
        <p
          className={`person-name font-sans font-bold leading-tight ${nameCls} ${roomy ? "text-display-l" : "text-heading-l"}`}
        >
          {person.name}
        </p>
        <p className={`mt-1.5 font-mono text-caption ${metaCls}`}>
          {person.role[locale]}
          {person.company ? ` · ${person.company}` : ""}
        </p>
        {person.gdgSince && (
          // Deliberately quiet — a fact about them, not a badge to win.
          <p className={`mt-1 text-caption ${labelCls}`}>
            {t("gdgSince", { year: person.gdgSince })}
          </p>
        )}
        {person.contribution && (
          <div className="mt-3">
            <Badge tone="primary" variant={dark ? "solid" : "outline"}>
              {person.contribution[locale]}
            </Badge>
          </div>
        )}
      </div>

      {blurb && (
        <p
          className={`person-bio whitespace-pre-line leading-relaxed ${bodyCls} ${roomy ? "text-body-l" : "text-body-m"} ${profileHref ? "line-clamp-4" : ""}`}
        >
          {blurb[locale]}
        </p>
      )}

      {profileHref && (
        <Link
          href={profileHref}
          tabIndex={interactive ? undefined : -1}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1.5 self-start font-sans text-body-m font-bold underline decoration-2 underline-offset-4 transition-colors hover:decoration-primary ${nameCls}`}
        >
          {t("fullProfile")}
          <ArrowRight size={16} weight="bold" aria-hidden />
        </Link>
      )}

      {/* Expertise chips — the same Badge as the contribution chip, outlined
          so they stay visible on the dark scrim and the light sheet alike. */}
      {tags.length > 0 && (
        <ul aria-label={t("expertise")} className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={`${tag.en}|${tag.fr}`}>
              <Badge tone="primary" variant="outline">
                {tag[locale]}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {/* Their session (ADR 0073): title, format, level, language, tags, an
          "Online" marker where it applies, and the description — the talk
          is half of why someone opened this profile. */}
      {talks.length > 0 && (
        <div className={`person-talk border-t-2 pt-5 ${ruleCls}`}>
          <p
            className={`font-mono text-mono-tag font-bold uppercase tracking-wide ${labelCls}`}
          >
            {talks.length > 1 ? t("talks") : t("talk")}
          </p>
          {talks.map((talk) => (
            <div key={talk.id} className="mt-3 flex flex-col gap-3">
              <p
                className={`font-sans font-bold leading-snug ${nameCls} ${roomy ? "text-heading-m" : "text-body-l"}`}
              >
                {talk.title[locale]}
              </p>
              <SessionMeta session={talk} tone={dark ? "dark" : "light"} />
              {talk.tags.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {talk.tags.map((tag) => (
                    <li key={`${tag.en}|${tag.fr}`}>
                      <Badge tone="primary" variant="outline">
                        {tag[locale]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {hasText(talk.description, locale) && (
                <p
                  className={`whitespace-pre-line text-body-m leading-relaxed ${bodyCls}`}
                >
                  {talk.description[locale]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Icebreaker — a quote moment, not a data row. Skipped entirely when
          the person has not written one: an empty quote block with a stray
          quotation mark reads as a rendering failure. A "—" placeholder (the
          CSV/Sessionize import's "not given") counts as not written. */}
      {personality &&
        hasText(person.icebreakerQuestion, locale) &&
        hasText(person.icebreakerAnswer, locale) && (
          <div className={`person-icebreaker border-t-2 pt-5 ${ruleCls}`}>
            <p
              className={`font-mono text-mono-tag font-bold uppercase tracking-wide ${labelCls}`}
            >
              {t("icebreaker")}
            </p>
            <p className={`mt-2 text-body-m ${bodyCls}`}>
              {person.icebreakerQuestion![locale]}
            </p>
            <div className="mt-3 flex gap-2.5">
              <Quotes
                size={roomy ? 24 : 20}
                weight="fill"
                aria-hidden
                className={`shrink-0 ${dark ? "text-primary" : "text-primary"}`}
              />
              {/* PHASE11 §5.3: the roomy answer was display-sized (heading-l) and
              dominated the slide; heading-m still reads as the quote's
              punchline without pushing the rest of the slide off. */}
              <p
                className={`font-sans font-bold leading-snug ${nameCls} ${roomy ? "text-heading-m" : "text-body-l"}`}
              >
                {person.icebreakerAnswer![locale]}
              </p>
            </div>
          </div>
        )}

      {personality && hasText(person.funnyMoment, locale) && (
        <div
          className={`flex items-start gap-2.5 rounded-lg border-2 px-4 py-3 ${
            dark
              ? "border-offwhite/25 bg-offwhite/5"
              : "border-black02/20 bg-pastel"
          }`}
        >
          <Sparkle
            size={18}
            weight="duotone"
            aria-hidden
            className="mt-0.5 shrink-0 text-primary"
          />
          <div>
            <p
              className={`font-mono text-mono-tag font-bold uppercase tracking-wide ${labelCls}`}
            >
              {t("funny")}
            </p>
            <p className={`mt-1 text-body-m ${bodyCls}`}>
              {person.funnyMoment![locale]}
            </p>
          </div>
        </div>
      )}

      {socials.length > 0 && (
        <div className="flex gap-2.5">
          {socials.map(({ key, href, Icon, label }) => (
            <a
              key={key}
              href={href}
              aria-label={`${person.name} — ${label}`}
              tabIndex={interactive ? undefined : -1}
              onClick={(e) => e.stopPropagation()}
              className={`flex h-11 w-11 items-center justify-center rounded-pill border-2 transition-[background-color,color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary hover:text-black02 motion-reduce:transform-none ${
                dark
                  ? "border-offwhite/30 text-offwhite"
                  : "border-black02 text-black02"
              }`}
            >
              <Icon size={20} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
