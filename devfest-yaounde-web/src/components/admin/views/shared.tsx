"use client";

import { Warning } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { toCsv } from "@/lib/admin/csv";

export function PageHeader({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-sans text-heading-l font-bold text-black02">
        {title}
      </h1>
      <p className="mt-1 max-w-2xl text-body-m text-black02/70">{blurb}</p>
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black02/20 bg-offwhite p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-heading-m font-bold text-black02">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-body-m text-black02/70">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function InfoBanner({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <p
      className={`mb-4 flex items-start gap-2.5 rounded-lg px-4 py-3 text-body-m text-black02 ${
        tone === "warn"
          ? "border border-danger/40 bg-danger-pastel"
          : "border border-black02/15 bg-pastel"
      }`}
    >
      <Warning
        size={18}
        weight="bold"
        aria-hidden
        className="mt-0.5 shrink-0"
      />
      <span>{children}</span>
    </p>
  );
}

/**
 * The banner every read-only view carries.
 *
 * It names the reason and the record rather than saying "coming soon", because
 * the reason is a decision someone has to take, not a task someone forgot.
 */
export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return <InfoBanner tone="warn">{children}</InfoBanner>;
}

export function DataTable({
  headers,
  rows,
  empty,
  compact = false,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
  /**
   * For narrow tables of a few short columns (the commerce recap): no
   * minimum width and tighter cells, so every column fits a phone instead of
   * scrolling sideways. Other tables keep the wide layout.
   */
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border-2 border-dashed border-black02/40 px-4 py-10 text-center text-body-m text-black02/70">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table
        className={`w-full border-collapse text-left ${compact ? "" : "min-w-[42rem]"}`}
      >
        <thead className="sticky top-0 z-10 bg-offwhite">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className={`border-b border-black02/30 py-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70 ${
                  compact ? "px-2 sm:px-4" : "whitespace-nowrap px-4"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-black02/10 ${
                i % 2 === 1 ? "bg-pastel/40" : ""
              }`}
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`py-3 align-middle text-body-m text-black02 ${
                    compact ? "px-2 sm:px-4" : "px-4"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Download what is on screen as CSV.
 *
 * Every value goes through `toCsv`, which neutralises anything a spreadsheet
 * would treat as a formula — the export direction is the one people forget,
 * and it is the one where a nickname typed by a stranger ends up executing in
 * an organiser's Excel.
 */
export function ExportButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: unknown[][];
}) {
  function download() {
    const blob = new Blob([toCsv(headers, rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="shrink-0 rounded-pill border-2 border-black02 bg-offwhite px-4 py-2 font-sans text-body-m font-bold text-black02 hover:bg-primary"
    >
      Export CSV
    </button>
  );
}

export const money = (amount: number, currency: string) =>
  `${new Intl.NumberFormat("en-CM").format(amount)} ${currency}`;

export const when = (iso: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") : "—";

/**
 * Show enough of an address to recognise someone, not enough to harvest.
 *
 * The users list is a browsing surface — nobody contacts anyone from it — so
 * it shows masked addresses. Where an address IS the point of the row (a
 * ticket holder to email, an order to fulfil) it is shown in full, because
 * masking it there would just mean copying it out of the database instead.
 */
export function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [name, domain] = email.split("@");
  if (!domain) return "—";
  const head = name.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}
