"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminData } from "@/lib/admin/shape";
import { DataTable, ExportButton, InfoBanner, Panel, when } from "./shared";

const BTN =
  "inline-flex items-center rounded-pill border-2 border-black02 px-4 py-2 font-sans text-body-m font-bold text-black02 transition-colors hover:bg-pastel disabled:opacity-50";

const ROLE_LABEL: Record<string, string> = {
  attendee: "Attendees",
  speaker: "Speakers",
  volunteer: "Volunteers",
  organiser: "Organisers",
  partner: "Partners",
};

/**
 * Certificates (ADR 0100). The certificates themselves are made and emailed
 * by the Google Sheet's Apps Script (tools/certificates/); this page:
 *
 *   1. hands out the list of who was THERE, in the sheet's columns;
 *   2. shows every certificate the script has issued, with a way to revoke
 *      one (the public verify page then says so) or restore it.
 */
export function AdminCertificates({ data }: { data: AdminData }) {
  const [counts, setCounts] = useState<{
    total: number;
    byRole: Record<string, number>;
    missingEmail: Record<string, number>;
  } | null>(null);
  const [countsError, setCountsError] = useState(false);
  const [rows, setRows] = useState(data.certificates);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/certificates/list?format=json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) setCounts(json);
      })
      .catch(() => {
        if (!cancelled) setCountsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setRevoked(id: string, revoked: boolean) {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/certificates/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, revoked }),
      });
      if (res.ok) {
        const { revokedAt } = (await res.json()) as {
          revokedAt: string | null;
        };
        setRows((list) =>
          list
            ? list.map((c) => (c.id === id ? { ...c, revokedAt } : c))
            : list,
        );
      }
    } finally {
      setBusy(null);
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (c) => !q || `${c.id} ${c.fullName} ${c.role}`.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-5">
      <InfoBanner>
        Certificates are made and emailed from the <strong>Google Sheet</strong>{" "}
        (Apps Script in <code>tools/certificates/</code>). Each one the script
        generates is recorded here, so the QR code on it opens a page saying
        it&apos;s genuine. No email address is stored on the site.
      </InfoBanner>

      <Panel
        title="1 · Who gets one"
        subtitle="Everyone the site knows was there, in the sheet's columns: checked-in tickets and reservations, volunteers, speakers marked as arrived and the team. Speakers' and organisers' emails aren't on the site — fill them in the sheet. Add the Bevy check-ins from Bevy's own export (with full emails)."
        action={
          <a
            href="/api/admin/certificates/list?format=csv"
            download
            className={`${BTN} bg-primary`}
          >
            Download the list (CSV)
          </a>
        }
      >
        {countsError ? (
          <p className="text-body-m text-black02/70">Counts unavailable.</p>
        ) : !counts ? (
          <p className="text-body-m text-black02/70">Counting…</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {Object.entries(ROLE_LABEL)
              .filter(([role]) => counts.byRole[role])
              .map(([role, label]) => (
                <li
                  key={role}
                  className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-3"
                >
                  <span className="block font-sans text-heading-m font-bold text-black02">
                    {counts.byRole[role]}
                  </span>
                  <span className="text-caption text-black02/70">
                    {label}
                    {counts.missingEmail[role]
                      ? ` · ${counts.missingEmail[role]} without email`
                      : ""}
                  </span>
                </li>
              ))}
            <li className="rounded-lg border-2 border-black02 bg-primary px-4 py-3">
              <span className="block font-sans text-heading-m font-bold text-black02">
                {counts.total}
              </span>
              <span className="text-caption text-black02/80">
                Certificates in all
              </span>
            </li>
          </ul>
        )}
        <p className="mt-3 text-caption text-black02/65">
          Personal data: keep the file off shared drives. Every download is
          written to the audit log.
        </p>
      </Panel>

      {rows === null ? (
        <InfoBanner tone="warn">
          <strong>Not live yet.</strong> Apply migration{" "}
          <code>0048_certificates.sql</code> in Supabase and set{" "}
          <code>CERTIFICATES_SECRET</code>. Until then the script can&apos;t
          register certificates and their QR codes lead to &ldquo;not
          found&rdquo;.
        </InfoBanner>
      ) : (
        <Panel
          title={`2 · Issued (${rows.length})`}
          subtitle="Recorded by the script when it generates a PDF. Revoking makes the verify page say the certificate is no longer valid; restoring undoes it."
          action={
            <ExportButton
              filename="devfest-certificates-issued.csv"
              headers={[
                "ID",
                "Edition",
                "Name",
                "Role",
                "Detail",
                "Issued",
                "Revoked",
              ]}
              rows={rows.map((c) => [
                c.id,
                c.edition,
                c.fullName,
                c.role,
                c.detail ?? "",
                c.issuedAt,
                c.revokedAt ?? "",
              ])}
            />
          }
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by number, name or role"
            className="mb-4 w-full max-w-md rounded-md border-2 border-black02 bg-offwhite px-4 py-2 text-body-m"
          />
          <DataTable
            headers={["Number", "Name", "Role", "Issued", "Status", ""]}
            empty="No certificate issued yet."
            rows={shown.map((c) => [
              <a
                key="id"
                href={`/certificates/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-bold underline"
              >
                {c.id}
              </a>,
              c.fullName,
              c.role,
              when(c.issuedAt),
              c.revokedAt ? "Revoked" : "Valid",
              <button
                key="act"
                type="button"
                disabled={busy === c.id}
                onClick={() => setRevoked(c.id, !c.revokedAt)}
                className={BTN}
              >
                {c.revokedAt ? "Restore" : "Revoke"}
              </button>,
            ])}
          />
        </Panel>
      )}
    </div>
  );
}
