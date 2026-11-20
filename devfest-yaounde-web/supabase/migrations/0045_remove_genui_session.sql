/*
 * Remove the "GenUI: Making Mobile Interfaces Dynamic with AI" session
 * (15:50, Room 5): its speaker is no longer speaking (ADR 0095).
 *
 * Deletes only that one entry from the sessions collection; everything else
 * is untouched. Idempotent (a second run finds nothing to remove). The whole
 * row is snapshotted into editorial_migration_backup first, so it can be put
 * back. Anyone who marked it "this interests me" simply no longer sees it.
 */
insert into public.editorial_migration_backup (migration, document_id, payload)
select '0045', d.id, d.payload
from public.editorial_documents d
where d.id = 'sessions'
on conflict (migration, document_id) do nothing;

update public.editorial_documents d
set payload = coalesce((
  select jsonb_agg(e order by o)
  from jsonb_array_elements(d.payload) with ordinality as t(e, o)
  where e ->> 'id' <> 'agenda-genui-making-mobile-interfaces-dynamic-with-ai'
), '[]'::jsonb)
where d.id = 'sessions';
