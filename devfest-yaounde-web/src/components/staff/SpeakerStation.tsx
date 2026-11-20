"use client";

import { Check, Gift, MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { SpeakerMark, SpeakerRow } from "@/lib/staff/speakers";
import { staffRequest, StationShell } from "./kit";

type Marks = Record<string, SpeakerMark>;

const EMPTY: SpeakerMark = { arrivedAt: null, swagAt: null, note: null };

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The speaker check-in (ADR 0092). Speakers have no QR ticket, so this is a
 * plain list: find them, tap Arrived, and tap Swag collected when they take
 * it — no scanning, no eligibility rules. A tap can be undone (a wrong name
 * must not be permanent), and a note records what was missing from the bag.
 */
export function SpeakerStation() {
  const t = useTranslations("staff.speakers");
  const [speakers, setSpeakers] = useState<SpeakerRow[] | null>(null);
  const [marks, setMarks] = useState<Marks>({});
  const [available, setAvailable] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/staff/speakers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("down"))))
      .then(
        (body: {
          speakers: SpeakerRow[];
          marks: Marks;
          available: boolean;
        }) => {
          if (!live) return;
          setSpeakers(body.speakers);
          setMarks(body.marks);
          setAvailable(body.available);
        },
      )
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  async function mark(
    id: string,
    payload:
      | { action: "arrived" | "swag"; on: boolean }
      | { action: "note"; note: string },
  ) {
    setBusy(id);
    setError(false);
    const response = await staffRequest<{ mark: SpeakerMark }>(
      "/api/staff/speakers",
      { method: "POST", body: JSON.stringify({ speakerId: id, ...payload }) },
      [200],
    );
    setBusy(null);
    if (response.kind === "ok") {
      setMarks((m) => ({ ...m, [id]: response.body.mark }));
    } else {
      setError(true);
    }
  }

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return (speakers ?? []).filter((s) => !q || fold(s.name).includes(q));
  }, [speakers, query]);
  const arrived = Object.values(marks).filter((m) => m.arrivedAt).length;
  const time = (iso: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: "Africa/Douala",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <StationShell
      title={t("title")}
      counter={
        speakers ? t("counter", { arrived, total: speakers.length }) : undefined
      }
    >
      <p className="text-body-m text-black02/80">{t("intro")}</p>
      {!available && (
        <p
          role="alert"
          className="rounded-md border-2 border-black02 bg-offwhite px-4 py-3 text-body-m font-bold text-black02"
        >
          {t("unavailable")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-body-m font-bold text-black02">
          {t("error")}
        </p>
      )}

      <label className="relative block">
        <span className="sr-only">{t("search")}</span>
        <MagnifyingGlass
          size={22}
          weight="bold"
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black02/60"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          className="w-full rounded-pill border-2 border-black02 bg-offwhite py-3.5 pl-12 pr-4 font-sans text-body-l text-black02 focus:outline-none"
        />
      </label>

      {speakers === null && !error ? (
        <p className="text-body-m text-black02/70">{t("loading")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((s) => {
            const m = marks[s.id] ?? EMPTY;
            return (
              <SpeakerCard
                key={s.id}
                speaker={s}
                mark={m}
                busy={busy === s.id}
                disabled={!available}
                arrivedLabel={
                  m.arrivedAt
                    ? t("arrivedAt", { time: time(m.arrivedAt) })
                    : null
                }
                swagLabel={
                  m.swagAt ? t("swagAt", { time: time(m.swagAt) }) : null
                }
                onToggle={(action, on) => void mark(s.id, { action, on })}
                onNote={(note) => void mark(s.id, { action: "note", note })}
              />
            );
          })}
          {shown.length === 0 && (
            <li className="text-body-m text-black02/75">{t("none")}</li>
          )}
        </ul>
      )}
    </StationShell>
  );
}

function SpeakerCard({
  speaker,
  mark,
  busy,
  disabled,
  arrivedLabel,
  swagLabel,
  onToggle,
  onNote,
}: {
  speaker: SpeakerRow;
  mark: SpeakerMark;
  busy: boolean;
  disabled: boolean;
  arrivedLabel: string | null;
  swagLabel: string | null;
  onToggle: (action: "arrived" | "swag", on: boolean) => void;
  onNote: (note: string) => void;
}) {
  const t = useTranslations("staff.speakers");
  const [note, setNote] = useState(mark.note ?? "");
  const [open, setOpen] = useState(Boolean(mark.note));
  const btn = (on: boolean) =>
    `flex flex-1 items-center justify-center gap-2 rounded-pill border-2 border-black02 px-3 py-3 font-sans text-body-m font-bold text-black02 transition-colors disabled:opacity-50 ${
      on ? "bg-primary" : "bg-offwhite hover:bg-pastel"
    }`;
  return (
    <li className="rounded-lg border-2 border-black02 bg-offwhite p-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={speaker.photoUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-pill border-2 border-black02 object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-sans text-body-l font-bold text-black02">
            {speaker.name}
          </p>
          {speaker.company && (
            <p className="truncate text-caption text-black02/70">
              {speaker.company}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          aria-pressed={Boolean(mark.arrivedAt)}
          disabled={busy || disabled}
          onClick={() => onToggle("arrived", !mark.arrivedAt)}
          className={btn(Boolean(mark.arrivedAt))}
        >
          {mark.arrivedAt ? (
            <Check size={18} weight="bold" aria-hidden />
          ) : (
            <MapPin size={18} weight="bold" aria-hidden />
          )}
          {mark.arrivedAt ? arrivedLabel : t("arrived")}
        </button>
        <button
          type="button"
          aria-pressed={Boolean(mark.swagAt)}
          disabled={busy || disabled}
          onClick={() => onToggle("swag", !mark.swagAt)}
          className={btn(Boolean(mark.swagAt))}
        >
          {mark.swagAt ? (
            <Check size={18} weight="bold" aria-hidden />
          ) : (
            <Gift size={18} weight="bold" aria-hidden />
          )}
          {mark.swagAt ? swagLabel : t("swag")}
        </button>
      </div>
      {mark.arrivedAt || mark.swagAt ? (
        <p className="mt-2 text-caption text-black02/65">{t("undoHint")}</p>
      ) : null}
      {open ? (
        <div className="mt-3">
          <label
            htmlFor={`sn-${speaker.id}`}
            className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70"
          >
            {t("noteLabel")}
          </label>
          <textarea
            id={`sn-${speaker.id}`}
            value={note}
            maxLength={500}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note.trim() !== (mark.note ?? "") && onNote(note)}
            placeholder={t("notePlaceholder")}
            className="mt-1 w-full resize-none rounded-md border-2 border-black02/30 bg-transparent px-3 py-2 text-body-m text-black02 focus:border-black02 focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-caption font-bold text-black02/70 underline underline-offset-2"
        >
          {t("addNote")}
        </button>
      )}
    </li>
  );
}
