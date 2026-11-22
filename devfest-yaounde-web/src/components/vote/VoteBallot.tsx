"use client";

import {
  ArrowSquareOut,
  CaretDown,
  CheckCircle,
  GoogleLogo,
  Trophy,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import type { VoteState } from "@/app/api/vote/route";
import { bouncyPop } from "@/lib/motion";
import { MAX_PICKS } from "@/lib/pitch-vote";
import { signInWithGoogle, signOut } from "@/lib/use-session";

export interface BallotProject {
  id: string;
  team: string;
  name: string;
  tagline: string;
  /** The team's own words, as sent. */
  pitch: string;
  url?: string;
  note?: string;
}

const CARD = "rounded-lg border-2 border-black02 bg-offwhite p-5 sm:p-6";
const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none motion-reduce:transform-none";
const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-6 py-3 font-sans text-body-m font-bold text-black02 transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-pastel active:translate-y-0.5 disabled:opacity-50 motion-reduce:transform-none";

/**
 * The ballot on `/vote` (ADR 0099).
 *
 * Asks `/api/vote` who is looking and renders the projects accordingly:
 * everyone can read them; a signed-in, checked-in voter gets a button on
 * each; once voting has closed, the ranking leads. Every rule is the
 * server's — this only reflects what it answers, and a refused vote is
 * explained, never assumed.
 */
export function VoteBallot({
  locale,
  projects,
  closes,
}: {
  locale: "fr" | "en";
  projects: BallotProject[];
  closes: { date: string; time: string };
}) {
  const t = useTranslations("pages.vote");
  const [state, setState] = useState<VoteState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    { kind: "saved" | "error"; text: string } | null
  >(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/vote", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {
      /* Offline: the projects still read; the buttons wait for a state. */
    }
  }, []);

  useEffect(() => {
    // Fetched, not rendered on the server: it depends on who is signed in.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch
    void load();
  }, [load]);

  /** Add or remove one pick; the server gets the whole new set. */
  async function toggle(projectId: string) {
    if (!state) return;
    const current = state.myVotes;
    const next = current.includes(projectId)
      ? current.filter((id) => id !== projectId)
      : [...current, projectId];
    if (next.length > MAX_PICKS) return;
    // Keep ballot order, whatever order they were tapped in.
    const ordered = projects.map((p) => p.id).filter((id) => next.includes(id));
    setBusy(projectId);
    setNotice(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: ordered }),
      });
      if (res.ok) {
        setState((s) => (s ? { ...s, myVotes: ordered } : s));
        setNotice({
          kind: "saved",
          text: ordered.length
            ? t("saved", { ...closes, count: ordered.length })
            : t("cleared"),
        });
        return;
      }
      const { error } = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (error === "vote_closed") {
        setNotice({ kind: "error", text: t("errorClosed") });
        await load();
      } else if (error === "not_eligible") {
        setState((s) => (s ? { ...s, eligible: false } : s));
      } else if (error === "vote_unavailable") {
        setState((s) => (s ? { ...s, unavailable: true } : s));
      } else if (error === "rate_limited") {
        setNotice({ kind: "error", text: t("errorRateLimited") });
      } else {
        setNotice({ kind: "error", text: t("errorGeneric") });
      }
    } catch {
      setNotice({ kind: "error", text: t("errorGeneric") });
    } finally {
      setBusy(null);
    }
  }

  const open = state ? state.open : true;
  const canVote = Boolean(
    state && state.open && !state.unavailable && state.eligible,
  );
  const results = state && !state.open ? state.results : null;
  const byId = new Map(projects.map((p) => [p.id, p]));

  return (
    <div>
      {/* ---------------- The window, and the rules ---------------- */}
      <p className="inline-flex rounded-pill border-2 border-black02 bg-primary px-4 py-1.5 font-mono text-mono-tag font-bold uppercase text-black02">
        {open ? t("openUntil", closes) : t("closedOn", closes)}
      </p>
      {open && (
        <p className="mt-4 max-w-2xl text-body-m text-black02/80">
          {t("rules")}
        </p>
      )}

      {/* ---------------- Results, once closed ---------------- */}
      {results && (
        <section className={`${CARD} mt-8`} aria-labelledby="vote-results">
          <h2
            id="vote-results"
            className="flex items-center gap-3 font-sans text-heading-l font-bold text-black02"
          >
            <Trophy size={32} weight="duotone" aria-hidden />
            {t("resultsTitle")}
          </h2>
          <p className="mt-2 text-body-m text-black02/80">
            {t("resultsLead", { count: state?.voters ?? 0 })}
          </p>
          <ol className="mt-6 space-y-4">
            {results.map((r) => {
              const p = byId.get(r.id);
              if (!p) return null;
              const top = r.rank === 1 && r.votes > 0;
              return (
                <li key={r.id}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-sans text-body-l font-bold text-black02">
                      <span className="mr-2 font-mono text-black02/60">
                        {r.rank}.
                      </span>
                      {p.name}
                      {top && (
                        <span className="ml-3 inline-flex rounded-pill border-2 border-black02 bg-primary px-3 py-0.5 align-middle font-mono text-mono-tag font-bold uppercase">
                          {t("winner")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-caption font-bold text-black02">
                      {t("votesShare", { count: r.votes, percent: r.percent })}
                    </span>
                  </div>
                  <div className="mt-2 h-4 overflow-hidden rounded-pill border-2 border-black02 bg-pastel">
                    <div
                      className="h-full rounded-pill bg-primary"
                      style={{ width: `${r.percent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* ---------------- Who is looking ---------------- */}
      {open && (
        <div className="mt-8" aria-live="polite">
          {!state ? (
            <p className="font-mono text-caption text-black02/70">
              {t("checking")}
            </p>
          ) : state.unavailable ? (
            <section className={CARD}>
              <h2 className="font-sans text-heading-m font-bold text-black02">
                {t("unavailableTitle")}
              </h2>
              <p className="mt-2 text-body-m text-black02/80">
                {t("unavailableBody")}
              </p>
            </section>
          ) : !state.signedIn ? (
            <section className={CARD}>
              <h2 className="font-sans text-heading-l font-bold text-black02">
                {t("signInTitle")}
              </h2>
              <p className="mt-2 max-w-prose text-body-m text-black02/80">
                {t("signInBody")}
              </p>
              <button
                type="button"
                onClick={() => signInWithGoogle(locale, `/${locale}/vote`)}
                className={`${PRIMARY} mt-5`}
              >
                <GoogleLogo size={20} weight="bold" aria-hidden />
                {t("continueWithGoogle")}
              </button>
            </section>
          ) : state.eligible ? (
            <p className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-4 py-2 font-sans text-body-m font-bold text-black02">
              <CheckCircle size={20} weight="fill" aria-hidden />
              {t("picksUsed", { count: state.myVotes.length, max: MAX_PICKS })}
            </p>
          ) : state.eligible === false ? (
            <section className={CARD}>
              <h2 className="font-sans text-heading-m font-bold text-black02">
                {t("notEligibleTitle")}
              </h2>
              <p className="mt-2 max-w-prose text-body-m text-black02/80">
                {t("notEligibleBody")}
              </p>
              <button
                type="button"
                onClick={async () => {
                  await signOut(locale);
                  setState(null);
                  await load();
                }}
                className={`${SECONDARY} mt-5`}
              >
                {t("signOut")}
              </button>
            </section>
          ) : null}

          {notice && (
            <p
              role={notice.kind === "error" ? "alert" : "status"}
              className={`mt-4 rounded-md border-2 px-4 py-3 text-body-m ${
                notice.kind === "saved"
                  ? "border-success bg-green-pastel text-black02"
                  : "border-danger bg-red-pastel text-black02"
              }`}
            >
              {notice.text}
            </p>
          )}
        </div>
      )}

      {/* ---------------- The projects ---------------- */}
      <h2 className="mt-14 font-sans text-heading-l font-bold text-black02">
        {t("projectsTitle")}
      </h2>
      <ol className="mt-6 grid gap-5">
        {projects.map((p, i) => {
          const mine = Boolean(state?.myVotes.includes(p.id));
          const full = (state?.myVotes.length ?? 0) >= MAX_PICKS;
          return (
            <li
              key={p.id}
              className={`${CARD} ${mine ? "outline outline-4 outline-offset-2 outline-primary" : ""}`}
            >
              <div className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-pill border-2 border-black02 bg-primary font-mono text-body-m font-bold text-black02"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-sans text-heading-m font-bold leading-tight text-black02">
                    {p.name}
                  </h3>
                  <p className="font-mono text-caption text-black02/70">
                    {p.team}
                  </p>
                  <p className="mt-3 text-body-m text-black02/85">
                    {p.tagline}
                  </p>

                  <details className="group mt-3">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-sans text-body-m font-bold text-black02 underline decoration-2 underline-offset-4 [&::-webkit-details-marker]:hidden">
                      {t("pitchToggle")}
                      <CaretDown
                        size={16}
                        weight="bold"
                        aria-hidden
                        className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </summary>
                    <div lang="fr" className="mt-3 border-l-4 border-primary pl-4">
                      {locale === "en" && (
                        <p
                          lang="en"
                          className="mb-2 font-mono text-caption text-black02/60"
                        >
                          {t("pitchLanguage")}
                        </p>
                      )}
                      <p className="whitespace-pre-line text-body-m text-black02/85">
                        {p.pitch}
                      </p>
                    </div>
                  </details>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {mine && (
                      <span
                        key={`mine-${p.id}`}
                        className={`${bouncyPop} inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-4 py-2 font-sans text-body-m font-bold text-black02`}
                      >
                        <CheckCircle size={20} weight="fill" aria-hidden />
                        {t("yourVote")}
                      </span>
                    )}
                    {canVote && mine && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => toggle(p.id)}
                        className={SECONDARY}
                      >
                        {t("removeVote", { name: p.name })}
                      </button>
                    )}
                    {canVote && !mine && !full && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => toggle(p.id)}
                        className={PRIMARY}
                      >
                        {t("voteFor", { name: p.name })}
                      </button>
                    )}
                    {canVote && !mine && full && (
                      <span className="font-mono text-caption text-black02/70">
                        {t("bothUsed")}
                      </span>
                    )}
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-sans text-body-m font-bold text-blue-ink underline decoration-2 underline-offset-4"
                      >
                        {t("tryIt", { name: p.name })}
                        <ArrowSquareOut size={16} weight="bold" aria-hidden />
                      </a>
                    )}
                    {p.note && (
                      <span className="font-mono text-caption text-black02/70">
                        {p.note}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
