-- Single event date, editable from Admin → Config.
-- NULL keeps the repository default. Apply before saving a date in the admin.
alter table public.site_settings
  add column if not exists event_date date;

comment on column public.site_settings.event_date is
  'Event date in Yaoundé local time. NULL uses the repository default (2026-11-21).';
