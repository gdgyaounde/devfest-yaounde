# 0083 — Commerce recap on the dashboard home

Date: 2026-11-17
Status: Accepted

## Context

Organisers need to know, for the day, how many of each item to have on
hand. That depends on two sources: what each ticket's "In the box" contains,
and what shop orders contain. The dashboard only had a per-tier apparel-size
table (ADR 0075) and capped lists.

## Decision

A **Commerce recap** panel on the dashboard home, with three tables and one
CSV (`devfest-commerce-recap.csv`, a Section column telling them apart):

1. **Items to account for** — per product: from tickets, from shop, total.
2. **Tickets sold** — per tier.
3. **Shop orders** — per product and option (size/colour): units, revenue.

- A ticket's box is by reference (ADR 0054): each ticket brings one of
  every product in its tier's `swagProductIds`, including ticket-only
  products (the certificate).
- Refunded (resolved) tickets and orders and cancelled orders are left
  out, matching the day-of tools (ADR 0079).
- Computed from complete paged reads, not the capped dashboard lists, since
  it is used to order and pack stock. The arithmetic is a pure function
  (`commerceRecap`) with unit tests.
- Free passes taken on Bevy are not in this database, so they are not
  counted; the free pass has no box.
- `DataTable` gained an optional `compact` mode (no minimum width) so these
  narrow tables fit a phone.

## Consequences

- Sizes per garment stay in the apparel panel; here a T-shirt is one line.
- Revenue is shown for the shop (the price paid, snapshotted on the order
  line). Ticket revenue stays in the settled-revenue figure, which already
  accounts for discounts and fees.
