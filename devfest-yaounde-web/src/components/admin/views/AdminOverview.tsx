"use client";

import type { AdminData } from "@/lib/admin/shape";
import type { ContentCounts, ViewId } from "../AdminShell";
import { useEventDates } from "@/components/global/EventDateProvider";
import { EVENT, eventDates } from "@/lib/event";
import { AdminChart } from "./AdminChart";
import { DataTable, ExportButton, InfoBanner, Panel, money } from "./shared";

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
        {label}
      </p>
      <p className="mt-0.5 font-sans text-heading-m font-bold text-black02">
        {value}
      </p>
      {note && <p className="text-caption text-black02/65">{note}</p>}
    </div>
  );
}

function seriesByDay(rows: { createdAt: string; amount?: number }[]): {
  labels: string[];
  values: number[];
} {
  const map = new Map<string, number>();
  for (const row of rows) {
    const day = row.createdAt.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + (row.amount ?? 1));
  }
  const labels = [...map.keys()].sort();
  return { labels, values: labels.map((day) => map.get(day) ?? 0) };
}

function align(
  labels: string[],
  series: { labels: string[]; values: number[] },
): number[] {
  return labels.map((day) => {
    const i = series.labels.indexOf(day);
    return i >= 0 ? (series.values[i] ?? 0) : 0;
  });
}

function countdownCopy(configuredDates: readonly string[]): {
  value: string;
  note: string;
} {
  const dates = eventDates(configuredDates);
  if (!dates) {
    return {
      value: "TBA",
      note: `${EVENT.year} dates unconfirmed`,
    };
  }
  const start = new Date(`${dates.start}+01:00`).getTime();
  const days = Math.max(0, Math.ceil((start - Date.now()) / 86_400_000));
  return {
    value: String(days),
    note: days === 1 ? "day to D-Day" : "days to D-Day",
  };
}

export function AdminOverview({
  data,
  content,
  onGo,
}: {
  data: AdminData;
  content: ContentCounts;
  onGo: (v: ViewId) => void;
}) {
  const c = data.counts;
  const dday = countdownCopy(useEventDates());
  const tickets = seriesByDay(data.tickets.rows);
  const revenue = seriesByDay(
    data.transactions.rows
      .filter((row) => row.status === "activated")
      .map((row) => ({ createdAt: row.createdAt, amount: row.netAmount })),
  );
  const orders = seriesByDay(data.orders.rows);
  const wall = seriesByDay(data.wallCards);
  // Reservations (ADR 0084): cancelled ones are not demand.
  const live = data.reservations.filter((r) => r.status !== "cancelled");
  const reservations = seriesByDay(live);
  const reservedCash = seriesByDay(
    live.map((r) => ({ createdAt: r.createdAt, amount: r.totalXaf })),
  );
  const labels = [
    ...new Set([
      ...tickets.labels,
      ...revenue.labels,
      ...orders.labels,
      ...wall.labels,
      ...reservations.labels,
    ]),
  ].sort();

  const reservedNow = data.reservations.filter((r) => r.status === "reserved");
  const cashIn = data.reservations.filter((r) => r.status === "cash_received");
  const cancelled = data.reservations.filter(
    (r) => r.status === "cancelled",
  ).length;
  const sum = (rows: { totalXaf: number }[]) =>
    rows.reduce((n, r) => n + r.totalXaf, 0);

  return (
    <div className="flex flex-col gap-6">
      <InfoBanner>
        Free-pass RSVPs live on Bevy and never reach this system, so they are
        not counted here. A zero would look like nobody came.
      </InfoBanner>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="D-Day" value={dday.value} note={dday.note} />
        <Stat label="Paid tickets" value={String(c.paidTickets)} />
        <Stat
          label="Checked in"
          value={String(c.checkedIn)}
          note={
            c.paidTickets
              ? `${Math.round((c.checkedIn / c.paidTickets) * 100)}% of sold`
              : undefined
          }
        />
        <Stat
          label="Settled"
          value={money(c.settledRevenue, "XAF")}
          note="Activated, net of discounts and the transaction fee"
        />
        <Stat
          label="Reservations"
          value={String(reservedNow.length + cashIn.length)}
          note={`${reservedNow.length} awaiting cash · ${cashIn.length} paid at the venue${cancelled ? ` · ${cancelled} cancelled` : ""}`}
        />
        <Stat
          label="Cash to collect"
          value={money(sum(reservedNow), "XAF")}
          note="Reserved, not paid yet — base prices, no online fee"
        />
        <Stat
          label="Cash received"
          value={money(sum(cashIn), "XAF")}
          note="Marked received at the door"
        />
        <Stat label="Shop orders" value={String(c.orders)} />
        <Stat label="Users" value={String(c.users)} />
        <Stat
          label="Wall"
          value={data.wallEnabled ? String(c.wallApproved) : "off"}
        />
        <Stat
          label="Content"
          value={String(
            content.speakers +
              content.team +
              content.sessions +
              content.sponsors +
              content.faqs +
              content.products +
              content.tiers,
          )}
        />
      </div>

      <section className="w-full rounded-lg border border-black02/15 bg-offwhite p-5">
        <h2 className="font-sans text-heading-m font-bold text-black02">
          The edition so far
        </h2>
        <p className="mt-1 text-body-m text-black02/70">
          Counts on the left axis; settled XAF and cash reserved (to collect at
          the venue) on the right.
        </p>
        <div className="mt-4">
          <AdminChart
            labels={labels}
            series={[
              {
                label: "Tickets",
                values: align(labels, tickets),
                color: "#f9ab00",
              },
              {
                label: "Orders",
                values: align(labels, orders),
                color: "#4285f4",
              },
              {
                label: "Reservations",
                values: align(labels, reservations),
                color: "#57caff",
              },
              {
                label: "DP cards",
                values: align(labels, wall),
                color: "#34a853",
              },
              {
                label: "Revenue (XAF)",
                values: align(labels, revenue),
                color: "#1e1e1e",
                axis: "y1",
              },
              {
                label: "Reserved cash (XAF)",
                values: align(labels, reservedCash),
                color: "#7a7a7a",
                axis: "y1",
              },
            ]}
            caption={
              labels.length
                ? "One line per series, by day. Empty days stay at zero."
                : "Nothing to plot yet — the chart stays empty rather than invented."
            }
          />
        </div>
      </section>

      <CommerceRecap data={data} />

      <div className="flex flex-wrap gap-2.5">
        {(
          [
            ["tickets", "Find a ticket"],
            ["orders", "Move an order along"],
            ["wall", "Review the wall"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onGo(id)}
            className="rounded-pill border border-black02/30 bg-offwhite px-5 py-2.5 font-sans text-body-m font-bold text-black02 hover:bg-primary"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * COMMERCE RECAP (ADR 0083) — what was sold across tickets and the shop, and
 * how many of each item has to be accounted for: the items in each ticket's
 * "In the box" plus what shop orders contain. Over every ticket and order
 * (not the loaded page); refunded and cancelled ones are left out. One CSV
 * carries all three tables.
 */
function CommerceRecap({ data }: { data: AdminData }) {
  const { commerce } = data;
  const mono = "font-mono text-mono-tag font-bold uppercase";
  const csvHeaders = [
    "Section",
    "Item",
    "Detail",
    "From tickets",
    "From shop",
    "From reservations",
    "Total / sold",
    "Revenue XAF",
  ];
  const csvRows: (string | number)[][] = [
    ...commerce.tickets.map((t) => [
      "Tickets",
      t.name,
      `${t.priceXAF} XAF base price`,
      t.sold,
      "",
      t.reserved,
      t.sold + t.reserved,
      "",
    ]),
    ...commerce.shop.map((s) => [
      "Shop",
      s.name,
      s.variant,
      "",
      s.quantity,
      "",
      s.quantity,
      s.revenue,
    ]),
    ...commerce.reservedShop.map((s) => [
      "Shop (reserved)",
      s.name,
      s.variant,
      "",
      "",
      s.quantity,
      s.quantity,
      "",
    ]),
    ...commerce.swag.map((s) => [
      "To account for",
      s.name,
      "",
      s.fromTickets,
      s.fromShop,
      s.fromReservations,
      s.total,
      "",
    ]),
  ];
  const nothing =
    commerce.tickets.length === 0 &&
    commerce.shop.length === 0 &&
    commerce.reservedShop.length === 0 &&
    commerce.swag.length === 0;

  return (
    <Panel
      title="Commerce recap"
      subtitle="Paid online and reserved (cash at the venue, marked Reserved) side by side. Tickets and the shop, and every item to account for — the contents of each ticket's box plus what shop orders and reservations contain. Refunded orders and cancelled orders and reservations are left out."
      action={
        <ExportButton
          filename="devfest-commerce-recap.csv"
          headers={csvHeaders}
          rows={csvRows}
        />
      }
    >
      {nothing ? (
        <p className="text-body-m text-black02/70">
          Nothing sold or reserved yet — the recap fills in as tickets, orders
          and reservations come in.
        </p>
      ) : (
        <div className="flex flex-col gap-7">
          <div>
            <h3 className="font-sans text-body-l font-bold text-black02">
              Items to account for
            </h3>
            <p className="mb-3 text-caption text-black02/70">
              Ticket boxes + shop orders + reservations (cash still to collect).
              Sizes and colours are in the apparel panel and the shop table
              below.
            </p>
            <DataTable
              compact
              headers={[
                "Item",
                "From tickets",
                "From shop",
                "Reserved",
                "Total",
              ]}
              empty="No items yet."
              rows={[
                ...commerce.swag.map((s) => [
                  s.name,
                  String(s.fromTickets),
                  String(s.fromShop),
                  String(s.fromReservations),
                  <strong key="t">{s.total}</strong>,
                ]),
                ...(commerce.swag.length
                  ? [
                      [
                        <span key="a" className={mono}>
                          All items
                        </span>,
                        String(
                          commerce.swag.reduce((n, s) => n + s.fromTickets, 0),
                        ),
                        String(
                          commerce.swag.reduce((n, s) => n + s.fromShop, 0),
                        ),
                        String(
                          commerce.swag.reduce(
                            (n, s) => n + s.fromReservations,
                            0,
                          ),
                        ),
                        <strong key="t">
                          {commerce.swag.reduce((n, s) => n + s.total, 0)}
                        </strong>,
                      ],
                    ]
                  : []),
              ]}
            />
          </div>

          <div>
            <h3 className="font-sans text-body-l font-bold text-black02">
              Tickets sold
            </h3>
            <div className="mt-3">
              <DataTable
                compact
                headers={[
                  "Tier",
                  "Base price",
                  "Paid online",
                  "Reserved (cash)",
                  "Total",
                ]}
                empty="No tickets yet."
                rows={[
                  ...commerce.tickets.map((t) => [
                    <span key="n" className={mono}>
                      {t.name}
                    </span>,
                    money(t.priceXAF, "XAF"),
                    String(t.sold),
                    <ReservedMark key="r" n={t.reserved} />,
                    <strong key="t">{t.sold + t.reserved}</strong>,
                  ]),
                  ...(commerce.tickets.length
                    ? [
                        [
                          <span key="a" className={mono}>
                            All tiers
                          </span>,
                          "",
                          <strong key="t">{commerce.ticketsSold}</strong>,
                          <strong key="r">{commerce.ticketsReserved}</strong>,
                          <strong key="t">
                            {commerce.ticketsSold + commerce.ticketsReserved}
                          </strong>,
                        ],
                      ]
                    : []),
                ]}
              />
            </div>
          </div>

          <div>
            <h3 className="font-sans text-body-l font-bold text-black02">
              Shop orders
            </h3>
            <div className="mt-3">
              <DataTable
                compact
                headers={[
                  "Product",
                  "Option",
                  "Paid online",
                  "Reserved (cash)",
                  "Total",
                  "Revenue",
                ]}
                empty="No shop orders yet."
                rows={(() => {
                  // One row per product + option, paid online and reserved
                  // side by side, so nothing is counted twice or hidden.
                  const merged = new Map<
                    string,
                    {
                      name: string;
                      variant: string;
                      paid: number;
                      reserved: number;
                      revenue: number;
                    }
                  >();
                  for (const x of commerce.shop) {
                    merged.set(`${x.productId}|${x.variant}`, {
                      name: x.name,
                      variant: x.variant,
                      paid: x.quantity,
                      reserved: 0,
                      revenue: x.revenue,
                    });
                  }
                  for (const x of commerce.reservedShop) {
                    const key = `${x.productId}|${x.variant}`;
                    const row = merged.get(key) ?? {
                      name: x.name,
                      variant: x.variant,
                      paid: 0,
                      reserved: 0,
                      revenue: 0,
                    };
                    row.reserved += x.quantity;
                    merged.set(key, row);
                  }
                  const list = [...merged.values()].sort(
                    (p, q) =>
                      p.name.localeCompare(q.name) ||
                      p.variant.localeCompare(q.variant),
                  );
                  return [
                    ...list.map((x) => [
                      x.name,
                      x.variant || "—",
                      String(x.paid),
                      <ReservedMark key="r" n={x.reserved} />,
                      <strong key="t">{x.paid + x.reserved}</strong>,
                      money(x.revenue, "XAF"),
                    ]),
                    ...(list.length
                      ? [
                          [
                            <span key="a" className={mono}>
                              All products
                            </span>,
                            "",
                            <strong key="u">{commerce.shopUnits}</strong>,
                            <strong key="rs">
                              {list.reduce((n, x) => n + x.reserved, 0)}
                            </strong>,
                            <strong key="t">
                              {list.reduce(
                                (n, x) => n + x.paid + x.reserved,
                                0,
                              )}
                            </strong>,
                            <strong key="r">
                              {money(commerce.shopRevenue, "XAF")}
                            </strong>,
                          ],
                        ]
                      : []),
                  ];
                })()}
              />
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * A reserved count, marked so it is never mistaken for a paid one: a pill
 * with the word, not colour alone. Zero stays a plain dash.
 */
function ReservedMark({ n }: { n: number }) {
  if (n === 0) return <span className="text-black02/40">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <strong>{n}</strong>
      <span className="rounded-pill border border-black02/40 bg-pastel px-2 py-0.5 font-mono text-mono-tag font-bold uppercase text-black02">
        Reserved
      </span>
    </span>
  );
}
