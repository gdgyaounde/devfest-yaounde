"use client";

import { useMemo, useState } from "react";
import type { AdminData } from "@/lib/admin/shape";
import { Badge } from "@/components/ui/Badge";
import {
  DataTable,
  ExportButton,
  InfoBanner,
  Panel,
  money,
  when,
} from "./shared";

const FILTERS = [
  ["all", "All"],
  ["reserved", "Reserved"],
  ["cash_received", "Paid in cash"],
  ["cancelled", "Cancelled"],
] as const;

/**
 * Reservations (ADR 0084): what people reserved while payments were closed,
 * to be paid in cash at the venue. Cash is recorded at the door (Day-of tools
 * → Door check-in → Reservations) — this is the list and the export.
 *
 * Organisers see the phone and email: that is how a reservation is chased.
 * Volunteers never see them (the door search shows name and what was
 * reserved only).
 */
export function AdminReservations({ data }: { data: AdminData }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [query, setQuery] = useState("");

  const names = useMemo(() => {
    const fromCommerce = new Map<string, string>();
    for (const t of data.commerce.tickets) fromCommerce.set(t.tierId, t.name);
    return fromCommerce;
  }, [data.commerce.tickets]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.reservations
      .filter((r) => filter === "all" || r.status === filter)
      .filter(
        (r) =>
          !q ||
          [r.reference, r.contactName, r.contactPhone, r.contactEmail ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q),
      );
  }, [data.reservations, filter, query]);

  const live = data.reservations.filter((r) => r.status !== "cancelled");
  const owed = data.reservations
    .filter((r) => r.status === "reserved")
    .reduce((n, r) => n + r.totalXaf, 0);
  const received = data.reservations
    .filter((r) => r.status === "cash_received")
    .reduce((n, r) => n + r.totalXaf, 0);

  const summary = (r: AdminReservationRow) =>
    [
      ...r.tickets.map(
        (t) =>
          `${names.get(t.tierId) ?? t.tierId}: ${t.name}${t.apparelSize ? ` (${t.apparelSize})` : ""}`,
      ),
      ...r.items.map(
        (i) =>
          `${i.quantity}× ${i.productId}${i.variant ? ` (${[i.variant.size, i.variant.color].filter(Boolean).join(" ")})` : ""}`,
      ),
    ].join("; ");

  return (
    <div className="flex flex-col gap-5">
      <InfoBanner tone="warn">
        <strong>Cash, not card.</strong> Reservations are paid in cash at the
        venue — nothing here moved money. Volunteers record the cash at the door
        (Day-of tools → Door check-in → Reservations).
      </InfoBanner>

      <Panel
        title={`Reservations (${live.length} active)`}
        subtitle={`${money(owed, "XAF")} still to collect · ${money(received, "XAF")} received in cash. Base prices, no online fee.`}
        action={
          <ExportButton
            filename="devfest-reservations.csv"
            headers={[
              "Reference",
              "Status",
              "Name",
              "Phone",
              "Email",
              "What",
              "Total XAF",
              "Reserved at",
              "Cash received at",
              "Checked in at",
            ]}
            rows={data.reservations.map((r) => [
              r.reference,
              r.status,
              r.contactName,
              r.contactPhone,
              r.contactEmail ?? "",
              summary(r),
              r.totalXaf,
              r.createdAt,
              r.cashReceivedAt ?? "",
              r.checkedInAt ?? "",
            ])}
          />
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`rounded-pill border-2 border-black02 px-4 py-1.5 font-sans text-caption font-bold text-black02 ${filter === id ? "bg-primary" : "bg-offwhite hover:bg-pastel"}`}
            >
              {label}
            </button>
          ))}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Reference, name or phone"
            aria-label="Search reservations"
            className="ml-auto w-64 max-w-full rounded-pill border border-black02/25 bg-offwhite px-4 py-2 text-body-m text-black02 outline-none focus:border-black02"
          />
        </div>
        <DataTable
          headers={["Reference", "Who", "What", "Total", "Status", "Reserved"]}
          empty="No reservations match."
          rows={rows.map((r) => [
            <span key="ref" className="font-mono text-mono-tag font-bold">
              {r.reference}
            </span>,
            <span key="who">
              {r.contactName}
              <span className="block font-mono text-caption text-black02/65">
                {r.contactPhone}
              </span>
            </span>,
            <span key="what" className="text-caption">
              {summary(r)}
            </span>,
            money(r.totalXaf, "XAF"),
            <Badge
              key="s"
              tone={
                r.status === "cash_received"
                  ? "success"
                  : r.status === "cancelled"
                    ? "danger"
                    : "primary"
              }
              variant="outline"
            >
              {r.status === "cash_received"
                ? "Paid in cash"
                : r.status === "cancelled"
                  ? "Cancelled"
                  : "Reserved"}
            </Badge>,
            when(r.createdAt),
          ])}
        />
      </Panel>
    </div>
  );
}

type AdminReservationRow = AdminData["reservations"][number];
