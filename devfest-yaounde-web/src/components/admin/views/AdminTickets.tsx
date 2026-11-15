"use client";

import { useState } from "react";
import { LIST_CAP, type AdminData } from "@/lib/admin/shape";
import { DataTable, ExportButton, Panel, when } from "./shared";

export function AdminTickets({ data }: { data: AdminData }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const rows = data.tickets.rows.filter(
    (t) =>
      !needle ||
      t.attendeeName.toLowerCase().includes(needle) ||
      t.attendeeEmail.toLowerCase().includes(needle) ||
      t.badgeCode.toLowerCase().includes(needle) ||
      t.tierId.toLowerCase().includes(needle),
  );

  const apparel = data.apparel;

  return (
    <div className="flex flex-col gap-6">
      {/*
        APPAREL TOTALS (ADR 0075) — what the shirts are ordered from. Over
        every ticket (not just the loaded page), per tier because the item
        differs by tier, and always the latest size: holders can change it
        themselves until the edits cutoff, so export this AFTER that.
      */}
      {apparel.tiers.length > 0 && (
        <Panel
          title="Apparel sizes"
          subtitle={`Every ticket on a tier that includes apparel, by size — the latest size each holder chose.${
            apparel.missing > 0
              ? ` ${apparel.missing} still without a size.`
              : ""
          } Holders can change sizes until the edits cutoff (Config → Ticket sales & edits), so order after it.`}
          action={
            <ExportButton
              filename="devfest-apparel-sizes.csv"
              headers={["Tier", ...apparel.sizes, "No size", "Total"]}
              rows={[
                ...apparel.tiers.map((t) => [
                  t.tierId,
                  ...apparel.sizes.map((s) => String(t.counts[s] ?? 0)),
                  String(t.missing),
                  String(t.total),
                ]),
                [
                  "ALL",
                  ...apparel.sizes.map((s) => String(apparel.totals[s] ?? 0)),
                  String(apparel.missing),
                  String(apparel.tiers.reduce((n, t) => n + t.total, 0)),
                ],
              ]}
            />
          }
        >
          <DataTable
            headers={["Tier", ...apparel.sizes, "No size", "Total"]}
            empty="No apparel tickets yet."
            rows={[
              ...apparel.tiers.map((t) => [
                <span
                  key="t"
                  className="font-mono text-mono-tag font-bold uppercase"
                >
                  {t.tierId}
                </span>,
                ...apparel.sizes.map((s) => String(t.counts[s] ?? 0)),
                String(t.missing),
                <span key="n" className="font-bold">
                  {t.total}
                </span>,
              ]),
              [
                <span key="t" className="font-bold">
                  All tiers
                </span>,
                ...apparel.sizes.map((s) => (
                  <span key={s} className="font-bold">
                    {apparel.totals[s] ?? 0}
                  </span>
                )),
                <span key="m" className="font-bold">
                  {apparel.missing}
                </span>,
                <span key="n" className="font-bold">
                  {apparel.tiers.reduce((n, t) => n + t.total, 0)}
                </span>,
              ],
            ]}
          />
        </Panel>
      )}

      <Panel
        title="Paid tickets"
        subtitle={`Showing ${rows.length} of ${data.tickets.total}${
          data.tickets.total > LIST_CAP ? ` (first ${LIST_CAP} loaded)` : ""
        }. Free passes are on Bevy and are not here.`}
        action={
          <ExportButton
            filename="devfest-tickets.csv"
            headers={[
              "Badge code",
              "Name",
              "Email",
              "Tier",
              "Size",
              "Checked in",
              "Bought",
            ]}
            rows={rows.map((t) => [
              t.badgeCode,
              t.attendeeName,
              t.attendeeEmail,
              t.tierId,
              t.apparelSize ?? "",
              t.checkedInAt ?? "",
              t.createdAt,
            ])}
          />
        }
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, badge code or tier"
          className="mb-4 w-full max-w-md rounded-lg border-2 border-black02 bg-offwhite px-4 py-2.5 font-sans text-body-m text-black02"
        />
        <DataTable
          headers={[
            "Badge",
            "Attendee",
            "Tier",
            "Size",
            "Checked in",
            "Bought",
          ]}
          empty="No tickets match."
          rows={rows.map((t) => [
            <span key="b" className="font-mono text-mono-tag">
              {t.badgeCode}
            </span>,
            <span key="a">
              <span className="font-bold">{t.attendeeName}</span>
              <br />
              {/* Full address: this row exists to be contacted. */}
              <span className="text-caption text-black02/70">
                {t.attendeeEmail}
              </span>
            </span>,
            t.tierId,
            t.apparelSize ?? "—",
            t.checkedInAt ? when(t.checkedInAt) : "—",
            when(t.createdAt),
          ])}
        />
      </Panel>
    </div>
  );
}
