/*
 * Ticket perk wording (ADR 0082): every pass lists only what it ADDS.
 *
 * Feedback from the live /terms and /tickets: each paid pass said
 * "Everything in <the pass below>" and then repeated "Lunch and coffee
 * breaks" and "An event identifier" anyway, and listed physical items
 * ("This edition's t-shirt") that the "In the box" line under it lists
 * again. Some of those perk items did not match the box at all.
 *
 * The rule now: perks say what the pass GIVES you, each pass adding only
 * what is new; physical items live in ONE place, the swag list ("In the
 * box"). Decided with the organiser on 2026-11-17:
 *
 *   HAIKYU   unchanged.
 *   SONNET   Everything in the free pass · Lunch and coffee breaks · An event
 *            identifier.  (Dropped "This edition's t-shirt" — it is in the box.)
 *   OPUS     Everything in Sonnet · A bigger kit, notebook included.
 *            (Dropped the repeated lunch/identifier lines, "Notebook and pen"
 *            — in the box — and "This edition's tote bag": OPUS's box has no
 *            tote bag, and the box is what is handed out.)
 *   FABLE    Everything in OPUS · The premium kit: polo, mug and bucket hat.
 *            Description: "bottle and cap" → the polo, the mug and the
 *            bucket hat, which is what its box holds.
 *   MYTHOS   Everything in FABLE · The full kit, hoodie included · Collector
 *            lanyard (kept: handed out, but not a shop product).
 *
 * Only `perks` (and FABLE's `description`) change; prices, stock, swag and
 * every other field are carried over from the live row as it is.
 *
 * SAFETY, NOT SILENCE: the live row was last saved by migration 0031 at
 * 2026-11-15 21:14:22.960033 UTC. If it has been saved from the dashboard
 * since, this stops instead of overwriting that edit, and the changes above
 * have to be made by hand in Admin → Ticket tiers. The current payload is
 * snapshotted into `editorial_migration_backup` first.
 *
 * DEPLOY ORDER: any time — no code depends on it. The pages pick it up on
 * their next rebuild (a deploy, a dashboard save, or the hourly refresh).
 */
do $$
begin
  if exists (
    select 1 from public.editorial_documents
    where id = 'ticket-tiers'
      and updated_at <> '2026-11-15T21:14:22.960033+00:00'::timestamptz
  ) then
    raise exception
      'ticket perk wording 0033: ticket-tiers was edited after 2026-11-15 21:14:22 UTC. Not overwriting — make the perk changes listed in this file by hand in Admin → Ticket tiers (see ADR 0082).';
  end if;
end $$;

insert into public.editorial_migration_backup (migration, document_id, payload)
select '0033', d.id, d.payload
from public.editorial_documents d
where d.id = 'ticket-tiers'
on conflict (migration, document_id) do nothing;

update public.editorial_documents d
set payload = (
      select jsonb_agg(
        case t ->> 'id'
          when 'sonnet' then jsonb_set(t, '{perks}', $p$[
            {"label": {"en": "Everything in the free pass", "fr": "Tout ce que contient le pass gratuit"}},
            {"label": {"en": "Lunch and coffee breaks", "fr": "Déjeuner et pauses café"}, "icon": "coffee"},
            {"label": {"en": "An event identifier (badge, lanyard, bracelet or similar)", "fr": "Un identifiant de l'événement (badge, lanyard, bracelet ou similaire)"}, "icon": "ticket"}
          ]$p$::jsonb)
          when 'opus' then jsonb_set(t, '{perks}', $p$[
            {"label": {"en": "Everything in Sonnet", "fr": "Tout ce que contient Sonnet"}},
            {"label": {"en": "A bigger kit, notebook included", "fr": "Un kit plus fourni, carnet inclus"}}
          ]$p$::jsonb)
          when 'fable' then jsonb_set(
            jsonb_set(t, '{perks}', $p$[
              {"label": {"en": "Everything in OPUS", "fr": "Tout ce que contient OPUS"}},
              {"label": {"en": "The premium kit: polo, mug and bucket hat", "fr": "Le kit premium : polo, mug et bob"}}
            ]$p$::jsonb),
            '{description}',
            $p${"en": "For the ones who want the premium kit: the polo, the mug and the bucket hat.", "fr": "Pour celles et ceux qui veulent le kit premium : le polo, le mug et le bob."}$p$::jsonb
          )
          when 'mythos' then jsonb_set(t, '{perks}', $p$[
            {"label": {"en": "Everything in FABLE", "fr": "Tout ce que contient FABLE"}},
            {"label": {"en": "The full kit, hoodie included", "fr": "Le kit complet, hoodie inclus"}},
            {"label": {"en": "Collector lanyard", "fr": "Lanyard collector"}}
          ]$p$::jsonb)
          else t
        end
        order by ord
      )
      from jsonb_array_elements(d.payload) with ordinality as e(t, ord)
    ),
    updated_at = now(),
    updated_by = null
where d.id = 'ticket-tiers';
