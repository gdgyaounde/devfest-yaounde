/*
 * A speaker for "Automatisez la gestion des admissions de vos evenements avec
 * Gemini et Google Apps Script" (ADR 0095, follow-up to 0043).
 *
 * Cyprien Tankeu (GDE Google Workspace, former GDG Yaounde lead) is added as a
 * visible speaker and linked to the session (workshop, French, Google
 * Workspace track). SAFE: appended only if the id is missing; the session is
 * updated only while it still has no speaker. Idempotent, with a snapshot of
 * both rows first.
 */
insert into public.editorial_migration_backup (migration, document_id, payload)
select '0044', d.id, d.payload
from public.editorial_documents d
where d.id in ('speakers', 'sessions')
on conflict (migration, document_id) do nothing;

update public.editorial_documents d
set payload = d.payload || $sp$[{"id": "cyprien-tankeu", "name": "Cyprien Tankeu", "role": {"fr": "GDE Google Workspace", "en": "GDE Google Workspace"}, "company": "", "photoUrl": "/speakers/cyprien-tankeu.webp", "bio": {"fr": "Google Developer Expert (GDE) en Google Workspace et ancien lead de GDG Yaoundé.", "en": "Google Developer Expert (GDE) in Google Workspace and former lead of GDG Yaoundé."}, "track": {"fr": "Google Workspace", "en": "Google Workspace"}, "day": 1, "sessionIds": ["agenda-automatisez-la-gestion-des-admissions-de-vos-eve"], "social": {"linkedin": "https://www.linkedin.com/in/cyprientankeu/", "x": "https://x.com/Cyprien_T"}, "icebreakerQuestion": {"fr": "", "en": ""}, "icebreakerAnswer": {"fr": "", "en": ""}}]$sp$::jsonb
where d.id = 'speakers'
  and not exists (
    select 1 from jsonb_array_elements(d.payload) e where e ->> 'id' = 'cyprien-tankeu'
  );

update public.editorial_documents d
set payload = (
  select jsonb_agg(
    case
      when e ->> 'id' = 'agenda-automatisez-la-gestion-des-admissions-de-vos-eve'
       and jsonb_array_length(coalesce(e -> 'speakerIds', '[]'::jsonb)) = 0
      then e || $pt${"speakerIds": ["cyprien-tankeu"], "language": ["fr"], "originalLanguage": "fr", "track": {"fr": "Google Workspace", "en": "Google Workspace"}}$pt$::jsonb
      else e
    end
    order by o)
  from jsonb_array_elements(d.payload) with ordinality as t(e, o)
)
where d.id = 'sessions';
