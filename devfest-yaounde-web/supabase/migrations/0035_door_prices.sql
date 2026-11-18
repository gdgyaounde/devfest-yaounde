/*
 * Cash prices at the venue (ADR 0084): from the payments cutoff (Wed 18 Nov
 * 12:00) people reserve and pay CASH, with no online fee, at new prices:
 *
 *   SONNET  5 000 XAF   OPUS  6 500 XAF   FABLE  12 000 XAF   MYTHOS  27 000 XAF
 *   SHOP: Mug GDG Yaoundé 2 500 XAF · La Casquette du Dev Senior 2 500 XAF
 *
 * Adds `venuePriceXAF` to those four tiers' payload, and to the two shop
 * products (`mug-community`, `the-senior-dev-cap`). `priceXAF` (the ONLINE
 * base price, charged until noon) is left exactly as it is, and so is every
 * other field. Reservations, the tickets page and /terms use the new field
 * once payments close.
 *
 * SAFETY, NOT SILENCE: the tiers row was last saved at 2026-11-17 08:06:06 UTC
 * (migration 0033) and the products row at 2026-10-08 13:33:49 UTC. If either
 * has been saved from the dashboard since, this stops (before changing
 * anything) instead of overwriting that edit — set "Cash price at the venue"
 * by hand in Admin → Ticket tiers / Shop instead. The current payload is
 * snapshotted into `editorial_migration_backup` first.
 *
 * DEPLOY ORDER: any time. Until it is applied the site falls back to each
 * tier's base price as its cash price.
 */
do $$
begin
  if exists (
    select 1 from public.editorial_documents
    where id = 'ticket-tiers'
      and updated_at <> '2026-11-17T08:06:06.716+00:00'::timestamptz
  ) then
    raise exception
      'door prices 0035: ticket-tiers was edited after 2026-11-17 08:06 UTC. Not overwriting — set "Cash price at the venue" by hand in Admin → Ticket tiers (sonnet 5000, opus 6500, fable 12000, mythos 27000).';
  end if;
  if exists (
    select 1 from public.editorial_documents
    where id = 'products'
      and updated_at <> '2026-10-08T13:33:49.443+00:00'::timestamptz
  ) then
    raise exception
      'door prices 0035: products was edited after 2026-10-08 13:33 UTC. Not overwriting — set "Cash price at the venue" by hand in Admin → Shop (Mug GDG Yaoundé 2500, La Casquette du Dev Senior 2500).';
  end if;
end $$;

insert into public.editorial_migration_backup (migration, document_id, payload)
select '0035', d.id, d.payload
from public.editorial_documents d
where d.id in ('ticket-tiers', 'products')
on conflict (migration, document_id) do nothing;

update public.editorial_documents d
set payload = (
      select jsonb_agg(
        case t ->> 'id'
          when 'sonnet' then t || '{"venuePriceXAF": 5000}'::jsonb
          when 'opus'   then t || '{"venuePriceXAF": 6500}'::jsonb
          when 'fable'  then t || '{"venuePriceXAF": 12000}'::jsonb
          when 'mythos' then t || '{"venuePriceXAF": 27000}'::jsonb
          else t
        end
        order by ord
      )
      from jsonb_array_elements(d.payload) with ordinality as e(t, ord)
    ),
    updated_at = now(),
    updated_by = null
where d.id = 'ticket-tiers';

update public.editorial_documents d
set payload = (
      select jsonb_agg(
        case t ->> 'id'
          when 'mug-community'      then t || '{"venuePriceXAF": 2500}'::jsonb
          when 'the-senior-dev-cap' then t || '{"venuePriceXAF": 2500}'::jsonb
          else t
        end
        order by ord
      )
      from jsonb_array_elements(d.payload) with ordinality as e(t, ord)
    ),
    updated_at = now(),
    updated_by = null
where d.id = 'products';
