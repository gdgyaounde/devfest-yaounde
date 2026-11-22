"use client";

import type { AdminData } from "@/lib/admin/shape";
import { PITCH_PROJECTS, rankTally, voteClosesAt, voteOpen } from "@/lib/pitch-vote";
import { ExportButton, InfoBanner, Panel, when } from "./shared";

/**
 * The pitch contest public vote, live (ADR 0099). Organisers see the tally
 * while voting is open; the public only sees it on /vote once it closes.
 * Counts only — never who voted for what.
 */
export function AdminPitchVote({ data }: { data: AdminData }) {
  const stats = data.pitchVote;
  const closesAt = voteClosesAt();
  // Read at render: the dashboard is a live, per-visit screen.
  const open = voteOpen(new Date(), closesAt);

  if (!stats) {
    return (
      <InfoBanner tone="warn">
        <strong>Not live yet.</strong> Apply migration{" "}
        <code>0046_pitch_votes.sql</code> in Supabase. Until then /vote says
        voting opens soon and accepts nothing.
      </InfoBanner>
    );
  }

  const ranked = rankTally(stats.tally, stats.voters);
  const name = new Map(PITCH_PROJECTS.map((p) => [p.id, p.name]));
  const turnout = stats.eligible
    ? Math.round((stats.voters / stats.eligible) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <InfoBanner>
        {open ? (
          <>
            Voting is <strong>open</strong> until {when(closesAt.toISOString())}.
            These results are for organisers only; /vote shows them to everyone
            once it closes.
          </>
        ) : (
          <>
            Voting <strong>closed</strong> {when(closesAt.toISOString())}. The
            results below are now public on /vote.
          </>
        )}
      </InfoBanner>

      <Panel
        title={`${stats.voters} ${stats.voters === 1 ? "person has" : "people have"} voted · ${stats.votes} pick${stats.votes === 1 ? "" : "s"}`}
        subtitle={`${stats.eligible} account${stats.eligible === 1 ? "" : "s"} on the site can vote · ${turnout}% turnout. Each person picks up to two projects; the % is the share of voters who picked it.`}
        action={
          <ExportButton
            filename="devfest-pitch-vote.csv"
            headers={["Rank", "Project", "Votes", "% of voters"]}
            rows={ranked.map((r) => [
              r.rank,
              name.get(r.id) ?? r.id,
              r.votes,
              r.percent,
            ])}
          />
        }
      >
        <ol className="flex flex-col gap-3">
          {ranked.map((r) => (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-4 text-body-m text-black02">
                <span className="font-bold">
                  <span className="mr-2 font-mono text-black02/60">
                    {r.rank}.
                  </span>
                  {name.get(r.id) ?? r.id}
                </span>
                <span className="font-mono text-caption font-bold">
                  {r.votes} · {r.percent}%
                </span>
              </div>
              <div className="mt-1.5 h-3 overflow-hidden rounded-pill bg-pastel">
                <div
                  className="h-full rounded-pill bg-primary"
                  style={{ width: `${r.percent}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
