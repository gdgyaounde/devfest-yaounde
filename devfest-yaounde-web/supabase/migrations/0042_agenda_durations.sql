/*
 * Agenda durations, corrected (ADR 0094).
 *
 * The agenda sheet has MERGED cells: the four workshops (09:50), the 09:20
 * Room 1 session and the 15:20 Room 1 session run 85 minutes, and the Pitch
 * Contest 12:40 to 14:05 (85 minutes). 0036 read each cell as one 25-minute
 * slot and so treated the rest of those merged cells as empty. This sets the
 * real length, and marks the two agenda-only blue (workshop) cells as
 * workshops like the four accepted ones.
 *
 * SAFE: only touches these ids, and only while a duration is still the 25 that
 * 0036 wrote (or 25 for the pitch), so a length an organiser edited from the
 * dashboard since is left alone. Idempotent. Snapshot taken first.
 */
insert into public.editorial_migration_backup (migration, document_id, payload)
select '0042', d.id, d.payload
from public.editorial_documents d
where d.id = 'sessions'
on conflict (migration, document_id) do nothing;

update public.editorial_documents d
set payload = (
  select jsonb_agg(
    case
      when e ->> 'id' in (
    'sz-1376670',
    'sz-1350359',
    'sz-1373948',
    'sz-1339016',
    'agenda-automatisez-la-gestion-des-admissions-de-vos-eve',
    'agenda-is-your-sign-in-with-button-really-safe',
    'agenda-pitch'
      ) and (e ->> 'durationMin')::int = 25
      then e || jsonb_build_object('durationMin', 85)
           || case when e ->> 'id' in ('agenda-automatisez-la-gestion-des-admissions-de-vos-eve', 'agenda-is-your-sign-in-with-button-really-safe')
                   then jsonb_build_object('kind', 'workshop')
                   else '{}'::jsonb end
      else e
    end
    order by ord)
  from jsonb_array_elements(d.payload) with ordinality as t(e, ord)
)
where d.id = 'sessions';
