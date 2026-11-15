/*
 * The ticketing cutoff: when ticket sales and ticket edits close (ADR 0072).
 *
 * Same shape as `hero`, `cfs`, `sponsor_call`, `legal`, `capacity`,
 * `memory_lane` and `nav`: one jsonb column per settings group.
 * `{ "salesCloseAt": "2026-11-18T23:59:00+01:00",
 *    "editsCloseAt": "2026-11-18T23:59:00+01:00" }` — ISO instants with an
 * explicit offset; "" means "no cutoff".
 *
 * NULL means "use the repository default" (`TICKET_SALES_CLOSE_AT` /
 * `TICKET_EDITS_CLOSE_AT` in `src/lib/site-config.ts`, both Wed 18 Nov 2026
 * 23:59 Africa/Douala), so nothing is seeded, and a key missing from the blob
 * falls back to its default as well.
 *
 * Deploy-order note: apply AFTER the code deploys (or before — either order is
 * safe). `loadSettings()` selects `*`, so the site reads fine before this runs
 * and the repo cutoff applies to checkout, the tickets page and the banner.
 * What needs this column is SAVING a change from Config → Ticketing, which
 * fails until it is applied.
 */
alter table public.site_settings
  add column if not exists ticketing jsonb;

comment on column public.site_settings.ticketing is
  'Ticketing cutoff: { salesCloseAt, editsCloseAt } ISO instants with offset; "" = no cutoff. Null = repo default (Wed 18 Nov 2026 23:59 +01:00).';
