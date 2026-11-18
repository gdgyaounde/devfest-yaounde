"use client";

import { CalendarPlus } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { ContentImage } from "@/components/ui/ContentImage";
import { Link } from "@/i18n/navigation";
import { useEventDates } from "@/components/global/EventDateProvider";
import { googleCalendarUrl, icsDataUrl } from "@/lib/calendar";
import { hasCalendarSlot } from "@/lib/sessions";
import type { Session, Speaker } from "@/data/types";

/** Past this many characters (or lines) a description is finished in the reader. */
const LONG_TEXT = 420;

export function isLongText(text: string): boolean {
  return text.length > LONG_TEXT || text.split("\n").length > 6;
}

/**
 * Everything around a session's description — tags, what to bring, who
 * speaks, add-to-calendar. One component so the card and the full-screen
 * reader can never drift apart.
 */
export function SessionExtras({
  session,
  speakers,
  showCalendar,
}: {
  session: Session;
  speakers: Speaker[];
  showCalendar: boolean;
}) {
  const eventDate = useEventDates()[0];
  const t = useTranslations("home.schedule");
  const locale = useLocale() as "fr" | "en";
  const sessionSpeakers = speakers;
  return (
    <>
      {session.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {session.tags.map((tag) => (
            <Badge key={tag.en} tone="primary" variant="outline">
              {tag[locale]}
            </Badge>
          ))}
        </div>
      )}

      {(session.bring || session.provided) && (
        <dl className="mt-5 flex flex-col gap-2.5">
          {session.bring && (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <dt className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                {t("bring")}
              </dt>
              <dd className="text-body-m text-black02/85">
                {session.bring[locale]}
              </dd>
            </div>
          )}
          {session.provided && (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <dt className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                {t("provided")}
              </dt>
              <dd className="text-body-m text-black02/85">
                {session.provided[locale]}
              </dd>
            </div>
          )}
        </dl>
      )}

      {showCalendar &&
        eventDate &&
        session.kind !== "break" &&
        hasCalendarSlot(session) && (
          <div className="mt-5">
            <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
              {t("addToCalendar")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={googleCalendarUrl(session, locale, eventDate)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3.5 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary"
              >
                <CalendarPlus size={14} weight="bold" aria-hidden />
                {t("google")}
              </a>
              <a
                href={icsDataUrl(session, locale, eventDate)}
                download={`${session.id}.ics`}
                className="inline-flex items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3.5 py-1.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary"
              >
                <CalendarPlus size={14} weight="bold" aria-hidden />
                {t("ics")}
              </a>
            </div>
          </div>
        )}

      {sessionSpeakers.length > 0 && (
        <div className="mt-5">
          <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
            {t("speakers")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {sessionSpeakers.map((s) => (
              <li key={s.id}>
                <Link
                  href={{ pathname: "/speakers", query: { spk: s.id } }}
                  className={`inline-flex items-center gap-3 rounded-pill border-2 border-black02 bg-offwhite py-1 pl-1 pr-5 font-bold text-body-m text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-primary`}
                >
                  <span
                    aria-hidden
                    className={`relative shrink-0 overflow-hidden rounded-pill border-2 border-black02 bg-pastel h-8 w-8`}
                  >
                    <ContentImage src={s.photoUrl} alt="" sizes="32px" />
                  </span>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
