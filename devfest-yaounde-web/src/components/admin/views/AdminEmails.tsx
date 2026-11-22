"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminSettings } from "@/lib/admin/shape";
import {
  renderLaunchUpdate,
  renderVoteAnnouncement,
  type LaunchAudience,
} from "@/lib/email/templates";
import { InfoBanner, Panel } from "./shared";

const AUDIENCES: {
  id: LaunchAudience;
  label: string;
  who: string;
  file: string;
}[] = [
  {
    id: "paid",
    label: "Paid holders & site users",
    who: "Ticket holders, ticket buyers and signed-in site users. Send from Gmail, BCC, in batches — the recipient list is below.",
    file: "launch-update-2026-11.paid.html",
  },
  {
    id: "free",
    label: "Free passes (Bevy)",
    who: "Everyone who RSVP'd the free pass. Their addresses live on Bevy only — send it through Bevy's attendee messaging.",
    file: "launch-update-2026-11.free.html",
  },
];

/** The hand-sent emails, newest first. */
const EMAILS = [
  { id: "vote", label: "Pitch vote is open" },
  { id: "launch", label: "Launch update (18 Nov)" },
] as const;
type EmailId = (typeof EMAILS)[number]["id"];

const VOTE_META = {
  label: "Every site account",
  who: "Everyone with an account on the site — all of them can vote (ADR 0099). Send from Gmail, BCC, in batches — the recipient list is below.",
  file: "vote-open-2026-11.html",
};

const BTN =
  "inline-flex items-center rounded-pill border-2 border-black02 px-4 py-2 font-sans text-body-m font-bold text-black02 transition-colors hover:bg-pastel";

/**
 * Admin → Emails (ADR 0076). A DOWNLOAD page, not a sender: there is no
 * sending domain, so nothing here sends anything. It previews the launch
 * update exactly as it will arrive (French, then English, in one message),
 * and hands the organiser the HTML, the plain text and — for the paid
 * audience — the recipient list to paste into Gmail's BCC.
 *
 * Rendered from the same function as `npm run emails:render`, with the LIVE
 * event date and cutoffs from settings, so the preview and what is sent are
 * the same text.
 */
export function AdminEmails({ settings }: { settings: AdminSettings }) {
  const [which, setWhich] = useState<EmailId>("vote");
  const [audience, setAudience] = useState<LaunchAudience>("paid");
  const [copied, setCopied] = useState<string | null>(null);
  const [counts, setCounts] = useState<{
    total: number;
    bySource: Record<string, number>;
  } | null>(null);
  const [countsError, setCountsError] = useState(false);

  const email = useMemo(
    () =>
      which === "vote"
        ? renderVoteAnnouncement()
        : renderLaunchUpdate({
            audience,
            eventDate: settings.eventDate,
            salesCloseAt: settings.ticketing.salesCloseAt,
            editsCloseAt: settings.ticketing.editsCloseAt,
            reservationsCloseAt: settings.ticketing.reservationsCloseAt,
          }),
    [which, audience, settings],
  );
  const meta =
    which === "vote" ? VOTE_META : AUDIENCES.find((a) => a.id === audience)!;
  const list = which === "vote" ? "accounts" : "launch";
  const showRecipients = which === "vote" || audience === "paid";

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/emails/recipients?format=json&list=${list}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) {
          setCounts(json);
          setCountsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCountsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [list]);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("Copy failed — select and copy by hand");
    }
  }

  function download() {
    const blob = new Blob([email.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = meta.file;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <InfoBanner>
        Nothing on this page sends email. There is no sending domain yet, so the
        emails go out by hand: Gmail (BCC) for site users and paid holders, Bevy
        for free passes. The same files are committed under{" "}
        <code>docs/content/emails/</code>.
      </InfoBanner>

      <div
        role="tablist"
        aria-label="Email"
        className="flex w-fit flex-wrap overflow-hidden rounded-pill border-2 border-black02"
      >
        {EMAILS.map((e) => (
          <button
            key={e.id}
            role="tab"
            type="button"
            aria-selected={which === e.id}
            onClick={() => {
              setWhich(e.id);
              setCounts(null);
            }}
            className={`px-4 py-2 font-mono text-mono-tag font-bold uppercase tracking-wide ${
              which === e.id
                ? "bg-primary text-black02"
                : "bg-transparent text-black02 hover:bg-pastel"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      {which === "launch" && (
        <div
          role="tablist"
          aria-label="Audience"
          className="flex w-fit overflow-hidden rounded-pill border-2 border-black02"
        >
          {AUDIENCES.map((a) => (
            <button
              key={a.id}
              role="tab"
              type="button"
              aria-selected={audience === a.id}
              onClick={() => setAudience(a.id)}
              className={`px-4 py-2 font-mono text-mono-tag font-bold uppercase tracking-wide ${
                audience === a.id
                  ? "bg-black02 text-offwhite"
                  : "bg-transparent text-black02 hover:bg-pastel"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <Panel title="The email" subtitle={meta.who}>
        <dl className="mb-4 grid gap-1 text-body-m">
          <dt className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
            Subject
          </dt>
          <dd className="font-bold text-black02">{email.subject}</dd>
        </dl>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={download}
            className={`${BTN} bg-primary`}
          >
            Download .html
          </button>
          <button
            type="button"
            onClick={() => copy("HTML copied", email.html)}
            className={BTN}
          >
            Copy HTML
          </button>
          <button
            type="button"
            onClick={() => copy("Plain text copied", email.text)}
            className={BTN}
          >
            Copy plain text
          </button>
          <button
            type="button"
            onClick={() => copy("Subject copied", email.subject)}
            className={BTN}
          >
            Copy subject
          </button>
          <span
            role="status"
            className="self-center text-body-m font-bold text-black02"
          >
            {copied}
          </span>
        </div>
        {/* sandbox="" — no scripts, no forms, no top navigation: the preview
            is inert, exactly like an inbox. */}
        <iframe
          title={`Preview — ${meta.label}`}
          srcDoc={email.html}
          sandbox=""
          className="h-[900px] w-full rounded-lg border-2 border-black02 bg-offwhite"
        />
      </Panel>

      {showRecipients && (
        <Panel
          title={
            which === "vote"
              ? "Recipients (every account)"
              : "Recipients (paid)"
          }
          subtitle={
            which === "vote"
              ? "Every account on the site — lower-cased, each address once. Personal data: keep the file off shared drives and delete it after sending."
              : "Ticket holders, buyers of activated ticket orders and signed-in site users — lower-cased, each address once. Personal data: keep the file off shared drives and delete it after sending."
          }
          action={
            <a
              href={`/api/admin/emails/recipients?format=csv&list=${list}`}
              download
              className={`${BTN} bg-primary`}
            >
              Download recipients CSV
            </a>
          }
        >
          {countsError ? (
            <p className="text-body-m text-black02/70">Counts unavailable.</p>
          ) : !counts ? (
            <p className="text-body-m text-black02/70">Counting…</p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {(
                [
                  ["ticket", "Ticket holders"],
                  ["buyer", "Buyers (no ticket of their own)"],
                  ["profile", "Site users only"],
                ] as const
              ).map(([key, label]) => (
                <li
                  key={key}
                  className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-3"
                >
                  <span className="block font-sans text-heading-m font-bold text-black02">
                    {counts.bySource[key] ?? 0}
                  </span>
                  <span className="text-caption text-black02/70">{label}</span>
                </li>
              ))}
              <li className="rounded-lg border-2 border-black02 bg-primary px-4 py-3">
                <span className="block font-sans text-heading-m font-bold text-black02">
                  {counts.total}
                </span>
                <span className="text-caption text-black02/80">
                  Total, each once
                </span>
              </li>
            </ul>
          )}
          <p className="mt-3 text-caption text-black02/65">
            Columns: email, name, source, locale. Every download is written to
            the audit log.
          </p>
        </Panel>
      )}

      <Panel title="How to send">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body-m text-black02/85">
          <li>
            <strong>Never paste the list into To or CC</strong> — always BCC,
            with your own address in To. Otherwise everyone sees everyone.
          </li>
          <li>
            <strong>Gmail limits:</strong> about 500 recipients a day from a
            personal account, about 2,000 from Google Workspace. Send in batches
            of <strong>90 or fewer</strong> BCC addresses per message.
          </li>
          <li>
            <strong>Getting the HTML into Gmail:</strong> open the downloaded
            .html in a browser, select all, copy, and paste into a new Gmail
            message — the formatting comes with it. Paste the subject from
            &ldquo;Copy subject&rdquo;. Send yourself a test first.
          </li>
          {which === "launch" && (
            <li>
              <strong>Free passes go through Bevy</strong> (attendee messaging):
              use the &ldquo;Free passes&rdquo; tab, paste the HTML if the
              editor accepts it, or the plain text if not.
            </li>
          )}
          <li>
            Check the test in Gmail on a phone, in dark mode, and with images
            off — the text carries the whole message without the logo.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
