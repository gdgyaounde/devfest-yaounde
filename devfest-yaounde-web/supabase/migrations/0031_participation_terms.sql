/*
 * Participation terms (ADR 0074): the free pass no longer promises food,
 * swag or an event identifier, and every paid pass says plainly that it
 * includes lunch and an identifier. Plus the footer's "Participation terms"
 * link moves from GDG's page to the new on-site /terms.
 *
 * ── 1. ticket-tiers ──────────────────────────────────────────────────────
 * The live `ticket-tiers` row overrides src/data/ticket-tiers.json, so the
 * repo edit alone changes nothing on the site. This writes the corrected
 * payload, computed from the live row as read (read-only) on 2026-11-15,
 * last saved 2026-09-23T16:04:30.173Z. Exactly these changes:
 *
 *   HAIKYU (free): removed "Lunch and coffee breaks" and "DevFest Yaounde
 *     sticker pack"; added "Workshops, within each room's capacity"; removed
 *     `swagProductIds` (no swag preview on a free pass). Kept "Access to
 *     every talk", "Access to the sponsor stands" and "Certificate of
 *     participation" (confirmed by the organiser: the certificate stays a
 *     free-pass perk).
 *   SONNET, OPUS, FABLE, MYTHOS: added "Lunch and coffee breaks" and "An
 *     event identifier (badge, lanyard, bracelet or similar)" right after
 *     their "Everything in …" line. Prices, stock, swag and every other field
 *     untouched.
 *
 * SAFETY, NOT SILENCE: if the row has been saved from the dashboard since
 * that read, this stops instead of overwriting the newer edit, and the same
 * changes have to be made by hand in Admin → Ticket tiers (listed above).
 * The current payload is snapshotted into `editorial_migration_backup`.
 *
 * ── 2. site_settings.legal ───────────────────────────────────────────────
 * `participationTermsUrl` → "/terms", ONLY if it still holds GDG's page (the
 * live value on 2026-11-15). Anything an organiser typed is left alone.
 * `termsVersion` / `termsUpdatedAt` need nothing here: they are absent from
 * the stored blob, so the repo defaults apply (settings.ts merges key by key).
 *
 * DEPLOY ORDER: apply AFTER the code deploys — /terms must exist before the
 * footer points at it.
 */
do $$
begin
  if exists (
    select 1 from public.editorial_documents
    where id = 'ticket-tiers'
      and updated_at <> '2026-09-23T16:04:30.173+00:00'::timestamptz
  ) then
    raise exception
      'participation terms 0031: ticket-tiers was edited after 2026-09-23 16:04:30 UTC. Not overwriting — apply the perk changes listed in this file by hand in Admin → Ticket tiers (see ADR 0074).';
  end if;
end $$;

insert into public.editorial_migration_backup (migration, document_id, payload)
select '0031', d.id, d.payload
from public.editorial_documents d
where d.id = 'ticket-tiers'
on conflict (migration, document_id) do nothing;

update public.editorial_documents
set payload = $tiers$[
  {
    "id": "haikyu",
    "name": "HAIKYU",
    "label": {
      "en": "Free pass",
      "fr": "Pass gratuit"
    },
    "perks": [
      {
        "label": {
          "en": "Access to every talk",
          "fr": "Accès à toutes les conférences"
        }
      },
      {
        "label": {
          "fr": "Les ateliers, dans la limite des places",
          "en": "Workshops, within each room's capacity"
        }
      },
      {
        "label": {
          "en": "Access to the sponsor stands",
          "fr": "Accès aux stands des sponsors"
        }
      },
      {
        "label": {
          "en": "Certificate of participation",
          "fr": "Certificat de participation"
        }
      }
    ],
    "onSale": true,
    "priceXAF": 0,
    "description": {
      "en": "Plain entry, free — the way DevFest has always been. You reserve it on our community page.",
      "fr": "L'entrée simple, gratuite — comme le DevFest l'a toujours été. La réservation se fait sur notre page communautaire."
    },
    "rsvpExternal": true,
    "includesApparel": false
  },
  {
    "id": "sonnet",
    "name": "SONNET",
    "label": {
      "en": "",
      "fr": ""
    },
    "perks": [
      {
        "label": {
          "en": "Everything in the free pass",
          "fr": "Tout ce que contient le pass gratuit"
        }
      },
      {
        "label": {
          "fr": "Déjeuner et pauses café",
          "en": "Lunch and coffee breaks"
        },
        "icon": "coffee"
      },
      {
        "label": {
          "fr": "Un identifiant de l'événement (badge, lanyard, bracelet ou similaire)",
          "en": "An event identifier (badge, lanyard, bracelet or similar)"
        },
        "icon": "ticket"
      },
      {
        "label": {
          "en": "This edition's t-shirt",
          "fr": "Le t-shirt de l'édition"
        }
      }
    ],
    "onSale": true,
    "priceXAF": 3500,
    "description": {
      "en": "The classic pass: the whole of DevFest, plus this edition's tee.",
      "fr": "Le pass classique : tout le DevFest, plus le t-shirt de l'édition."
    },
    "swagProductIds": [
      "tee-edition",
      "devfest-yaounde-silicon-wristband",
      "devfest-yaounde-2026-pen",
      "devfest-yaounde-2026-official-certificate"
    ],
    "includesApparel": true,
    "quantityAvailable": 150
  },
  {
    "id": "opus",
    "name": "OPUS",
    "label": {
      "en": "",
      "fr": ""
    },
    "perks": [
      {
        "label": {
          "en": "Everything in Sonnet",
          "fr": "Tout ce que contient Sonnet"
        }
      },
      {
        "label": {
          "fr": "Déjeuner et pauses café",
          "en": "Lunch and coffee breaks"
        },
        "icon": "coffee"
      },
      {
        "label": {
          "fr": "Un identifiant de l'événement (badge, lanyard, bracelet ou similaire)",
          "en": "An event identifier (badge, lanyard, bracelet or similar)"
        },
        "icon": "ticket"
      },
      {
        "label": {
          "en": "This edition's tote bag",
          "fr": "Tote bag de l'édition"
        }
      },
      {
        "label": {
          "en": "Notebook and pen",
          "fr": "Carnet et stylo"
        }
      }
    ],
    "onSale": true,
    "priceXAF": 5000,
    "description": {
      "en": "The full pass: the tee, the kit, and enough to leave properly equipped.",
      "fr": "Le pass complet : le t-shirt, le kit, et de quoi repartir équipé."
    },
    "swagProductIds": [
      "tee-edition",
      "devfest-yaounde-silicon-wristband",
      "devfest-yaounde-2026-pen",
      "devfest-yaounde-2026-notebook",
      "devfest-yaounde-2026-official-certificate"
    ],
    "includesApparel": true,
    "quantityAvailable": 40
  },
  {
    "id": "fable",
    "name": "FABLE",
    "label": {
      "en": "",
      "fr": ""
    },
    "perks": [
      {
        "label": {
          "en": "Everything in OPUS",
          "fr": "Tout ce que contient OPUS"
        }
      },
      {
        "label": {
          "fr": "Déjeuner et pauses café",
          "en": "Lunch and coffee breaks"
        },
        "icon": "coffee"
      },
      {
        "label": {
          "fr": "Un identifiant de l'événement (badge, lanyard, bracelet ou similaire)",
          "en": "An event identifier (badge, lanyard, bracelet or similar)"
        },
        "icon": "ticket"
      },
      {
        "label": {
          "en": "This edition's cap",
          "fr": "Casquette de l'édition"
        }
      }
    ],
    "onSale": true,
    "priceXAF": 10000,
    "description": {
      "en": "For the ones who want the whole kit, bottle and cap included.",
      "fr": "Pour celles et ceux qui veulent le kit entier, bouteille et casquette comprises."
    },
    "swagProductIds": [
      "mug-community",
      "devfest-yaounde-silicon-wristband",
      "devfest-yaounde-bucket-hat",
      "devfest-yaounde-2026-pen",
      "devfest-yaounde-2026-polo",
      "devfest-yaounde-2026-notebook",
      "devfest-yaounde-2026-official-certificate"
    ],
    "includesApparel": true,
    "quantityAvailable": 25
  },
  {
    "id": "mythos",
    "name": "MYTHOS",
    "label": {
      "en": "Legendary pass",
      "fr": "Pass légendaire"
    },
    "perks": [
      {
        "label": {
          "en": "Everything in FABLE",
          "fr": "Tout ce que contient FABLE"
        }
      },
      {
        "label": {
          "fr": "Déjeuner et pauses café",
          "en": "Lunch and coffee breaks"
        },
        "icon": "coffee"
      },
      {
        "label": {
          "fr": "Un identifiant de l'événement (badge, lanyard, bracelet ou similaire)",
          "en": "An event identifier (badge, lanyard, bracelet or similar)"
        },
        "icon": "ticket"
      },
      {
        "label": {
          "en": "This edition's hoodie",
          "fr": "Hoodie de l'édition"
        }
      },
      {
        "label": {
          "en": "Collector lanyard",
          "fr": "Lanyard collector"
        }
      }
    ],
    "onSale": true,
    "priceXAF": 25000,
    "description": {
      "en": "The legendary pass: all the swag, and the hoodie nobody else is getting.",
      "fr": "Le pass légendaire : tout le swag, et le hoodie que personne d'autre n'aura."
    },
    "swagProductIds": [
      "tee-edition",
      "mug-community",
      "tote-bag",
      "devfest-yaounde-silicon-wristband",
      "devfest-yaounde-bucket-hat",
      "devfest-yaounde-2026-pen",
      "devfest-yaounde-2026-hoodie",
      "devfest-yaounde-2026-notebook",
      "devfest-yaounde-2026-official-certificate"
    ],
    "includesApparel": true,
    "quantityAvailable": 10
  }
]$tiers$::jsonb,
    updated_at = now(),
    updated_by = null
where id = 'ticket-tiers';

update public.site_settings
set legal = jsonb_set(legal, '{participationTermsUrl}', '"/terms"'::jsonb),
    updated_at = now()
where id = 'site'
  and legal ->> 'participationTermsUrl' = 'https://gdg.community.dev/participation-terms/';
