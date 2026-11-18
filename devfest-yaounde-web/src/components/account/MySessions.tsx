"use client";

import { BookmarkSimple, MapPin } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

export interface AccountSession {
  id: string;
  title: { fr: string; en: string };
  time?: string;
  room?: { fr: string; en: string };
}

/**
 * "My sessions" (ADR 0086): the agenda sessions this person marked "This
 * interests me", in schedule order, with a way to take one off. Self-fetching
 * like `MyReservations`; the titles come from the page, the ids from the
 * person's own list on the server.
 */
export function MySessions({ sessions }: { sessions: AccountSession[] }) {
  const t = useTranslations("pages.account.mySessions");
  const locale = useLocale() === "en" ? "en" : "fr";
  const [ids, setIds] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/interests", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { sessionIds: [] }))
      .then((body: { sessionIds?: string[] }) => {
        if (live) setIds(body.sessionIds ?? []);
      })
      .catch(() => live && setIds([]));
    return () => {
      live = false;
    };
  }, []);

  async function remove(id: string) {
    setNotice(null);
    const before = ids;
    setIds((cur) => (cur ?? []).filter((x) => x !== id));
    try {
      const response = await fetch("/api/interests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: id, interested: false }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setIds(before);
      setNotice(t("removeFailed"));
    }
  }

  if (ids === null) {
    return <p className="text-body-m text-black02/70">{t("loading")}</p>;
  }

  const byId = new Map(sessions.map((s) => [s.id, s] as const));
  const rows = ids
    .map((id) => byId.get(id))
    .filter((s): s is AccountSession => Boolean(s))
    .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border-2 border-black02 bg-offwhite p-6">
        <BookmarkSimple size={32} weight="duotone" aria-hidden />
        <p className="mt-3 font-sans text-heading-m font-bold text-black02">
          {t("emptyTitle")}
        </p>
        <p className="mt-1 text-body-m text-black02/75">{t("emptyBody")}</p>
        <Link
          href="/schedule"
          className="mt-4 inline-flex rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02"
        >
          {t("browse")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {rows.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border-2 border-black02 bg-offwhite px-5 py-4"
          >
            {s.time && (
              <span className="rounded-pill border-2 border-black02 bg-primary px-3 py-1 font-mono text-mono-tag font-bold text-black02">
                {s.time}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-sans text-body-l font-bold leading-tight text-black02">
                {s.title[locale]}
              </p>
              {s.room?.[locale] && (
                <p className="mt-1 flex items-center gap-1.5 font-mono text-caption text-black02/70">
                  <MapPin size={14} weight="bold" aria-hidden />
                  {s.room[locale]}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void remove(s.id)}
              className="rounded-pill border-2 border-black02 px-4 py-1.5 font-sans text-body-m font-bold text-black02 transition-colors hover:bg-pastel"
            >
              {t("remove")}
            </button>
          </li>
        ))}
      </ul>
      {notice && <p className="mt-3 text-body-m text-black02/80">{notice}</p>}
      <Link
        href="/schedule"
        className="mt-5 inline-flex font-sans text-body-m font-bold text-black02 underline decoration-2 underline-offset-4"
      >
        {t("browse")}
      </Link>
    </div>
  );
}
