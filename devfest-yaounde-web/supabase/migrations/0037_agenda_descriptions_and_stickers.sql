/*
 * Agenda polish and partner stickers (ADR 0085, follow-up to 0036).
 *
 * 1. SESSIONS: gives the agenda's own entries (check-in, opening, breaks,
 *    partner words, pitch contest, closing, five title-only talks) a short
 *    description in both languages; the partner-words and pitch entries also
 *    name the logos they show (partnerIds); the closing entry becomes a
 *    thank-you / safe-journey note.
 * 2. SPONSORS: Impact Hub Yaounde gets the incubator sticker, TiC the venue
 *    (building) sticker.
 *
 * SAFE TO RE-RUN, NEVER CLOBBERS AN EDIT: a session is touched only while its
 * description is still empty in both languages (the closing title only while
 * it still has 0036's wording); stickers are set only where none exists.
 * Anything saved from the dashboard in the meantime is left alone. Both rows
 * are snapshotted into editorial_migration_backup first.
 *
 * DEPLOY ORDER: the code that understands partnerIds and sticker is already
 * on main; apply any time after it has deployed.
 */
insert into public.editorial_migration_backup (migration, document_id, payload)
select '0037', d.id, d.payload
from public.editorial_documents d
where d.id in ('sessions', 'sponsors')
on conflict (migration, document_id) do nothing;

update public.editorial_documents d
set payload = (
  select coalesce(jsonb_agg(
    case
      when p.patch is not null
        and coalesce(o.e -> 'description' ->> 'fr', '') = ''
        and coalesce(o.e -> 'description' ->> 'en', '') = ''
      then o.e || p.patch
           || case
                when o.e ->> 'id' = 'agenda-closing'
                 and o.e -> 'title' ->> 'en' = 'Miscellaneous & end of the programme'
                then jsonb_build_object('title', jsonb_build_object(
                       'fr', 'Merci et bon retour !',
                       'en', 'Thank you & safe travels home'))
                else '{}'::jsonb
              end
      else o.e
    end
    order by o.ord), '[]'::jsonb)
  from jsonb_array_elements(d.payload) with ordinality as o(e, ord)
  left join lateral (
    select x as patch
    from jsonb_array_elements($agenda$[{"id": "agenda-checkin", "description": {"fr": "Récupère ton accès, repère les salles et installe-toi : l'équipe est là pour t'accueillir et t'orienter avant le début des talks.", "en": "Pick up your access, find your way around the rooms and settle in: the team is here to welcome and guide you before the talks start."}}, {"id": "agenda-opening", "description": {"fr": "Le mot d'accueil de l'équipe : bienvenue à toutes et à tous, qui est GDG Yaoundé, et comment va se dérouler la journée — salles, pauses, concours de pitch.", "en": "A keynote-style welcome from the team: who we are at GDG Yaoundé, and how the day will unfold — rooms, breaks and the pitch contest."}}, {"id": "agenda-break-1", "description": {"fr": "Un moment pour souffler, se restaurer et discuter. C'est souvent là que naissent les meilleures conversations de la journée.", "en": "Time to catch your breath, grab something to eat and talk. This is often where the day's best conversations start."}}, {"id": "agenda-break-2", "description": {"fr": "Deuxième pause : recharge les batteries, retrouve des visages connus et fais-toi de nouveaux contacts avant les derniers talks.", "en": "Second break: recharge, find familiar faces and meet new ones before the last talks."}}, {"id": "agenda-partner-words", "description": {"fr": "Nos partenaires prennent la parole pour se présenter et dire ce qu'ils font pour la communauté tech.", "en": "Our partners take the floor to introduce themselves and share what they do for the tech community."}, "partnerIds": ["impact-hub-yaounde", "tic-foundation"]}, {"id": "agenda-pitch", "description": {"fr": "Le Pitch Contest, organisé avec Impact Hub Yaoundé : jusqu'à 15 équipes présélectionnées ont 3 minutes chacune, démo comprise, pour convaincre le public — sans jury ni questions. Le public vote ensuite pour deux projets lauréats, qui bénéficieront de 3 mois d'incubation chez Impact Hub Yaoundé dès février 2027 : mentorat, ressources d'accompagnement et accès gratuit au coworking et aux événements du Hub.", "en": "The Pitch Contest, run with Impact Hub Yaoundé: up to 15 shortlisted teams get 3 minutes each, demo included, to win over the audience — no jury, no questions. The audience then votes for two winning projects, who get 3 months of incubation at Impact Hub Yaoundé from February 2027: mentoring, support resources and free access to the coworking space and the Hub's events."}, "partnerIds": ["impact-hub-yaounde"]}, {"id": "agenda-closing", "description": {"fr": "Merci d'être venus ! Merci aux speakers, aux partenaires, aux bénévoles et à toi. Quelques photos, un dernier tour pour dire au revoir, et rentre bien — à l'année prochaine !", "en": "Thank you for coming! Thanks to our speakers, partners, volunteers and you. A few photos, one last round of goodbyes, and safe travels home — see you next year!"}}, {"id": "agenda-automatisez-la-gestion-des-admissions-de-vos-eve", "description": {"fr": "Comment automatiser l'accueil et les admissions de vos événements avec Gemini et Google Apps Script.", "en": "How to automate your events' check-in and admissions with Gemini and Google Apps Script."}}, {"id": "agenda-networking-and-visibility", "description": {"fr": "Comment développer son réseau et rendre son travail visible dans la communauté tech.", "en": "How to grow your network and make your work visible in the tech community."}}, {"id": "agenda-is-your-sign-in-with-button-really-safe", "description": {"fr": "Un regard sur la sécurité des boutons « Se connecter avec… » : sont-ils vraiment sûrs, et que vérifier avant de les ajouter à son application.", "en": "A look at the security of “Sign in with…” buttons: how safe they really are, and what to check before adding one to your app."}}, {"id": "agenda-au-dela-de-la-technologie-construire-des-startup", "description": {"fr": "Comment bâtir des startups africaines qui inspirent confiance, au-delà de la technologie.", "en": "How to build African startups people can trust, beyond the technology."}}, {"id": "agenda-genui-making-mobile-interfaces-dynamic-with-ai", "description": {"fr": "Comment l'IA générative permet de rendre les interfaces mobiles dynamiques et adaptatives.", "en": "How generative AI can make mobile interfaces dynamic and adaptive."}}]$agenda$::jsonb) x
    where x ->> 'id' = o.e ->> 'id'
    limit 1
  ) p on true
)
where d.id = 'sessions';

update public.editorial_documents d
set payload = (
  select coalesce(jsonb_agg(
    case
      when e ->> 'id' = 'impact-hub-yaounde' and not (e ? 'sticker')
        then e || '{"sticker":"incubator"}'::jsonb
      when e ->> 'id' = 'tic-foundation' and not (e ? 'sticker')
        then e || '{"sticker":"venue"}'::jsonb
      else e
    end
    order by ord), '[]'::jsonb)
  from jsonb_array_elements(d.payload) with ordinality as t(e, ord)
)
where d.id = 'sponsors';
