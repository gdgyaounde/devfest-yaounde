"use client";

import { useState } from "react";
import type { Sponsor } from "@/data/types";
import { slugify } from "@/lib/admin/form-helpers";
import { EntityCrud } from "../forms/EntityCrud";
import {
  Field,
  ImageField,
  LocalizedInput,
  Segmented,
  TextInput,
  usePendingPhoto,
} from "../forms/fields";
import { useToast } from "../forms/Toast";
import { InfoBanner } from "./shared";

const EMPTY = { fr: "", en: "" };

/**
 * `partner` sits in the same list as the sponsor tiers.
 *
 * It is a tier rather than a separate collection (ADR 0038): a Partner record
 * would be a byte-for-byte copy of a Sponsor, and the site renders one
 * marquee for both.
 *
 * RENAMED to match the ticket tiers' own naming, ascending — Haikyu the
 * entry paid tier, Mythos the top — with Community and Partner kept as the
 * two non-monetary options. The old platinum/gold/silver names are gone;
 * see the sponsor-tier-rename ADR for the migration.
 */
const TIERS: { value: NonNullable<Sponsor["tier"]>; label: string }[] = [
  { value: "haikyu", label: "Haikyu" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "fable", label: "Fable" },
  { value: "mythos", label: "Mythos" },
  { value: "community", label: "Community" },
  { value: "partner", label: "Partner" },
];

export function AdminSponsors({ rows }: { rows: Sponsor[] }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const photo = usePendingPhoto();

  /**
   * Attach the picked file to a record that now exists.
   *
   * Called from `afterSave`, never straight from the picker — the endpoint
   * updates an entry by id, so the entry has to have been written first.
   */
  async function uploadPending(entryId: string) {
    if (!photo.pending) return;
    setUploading(true);
    const body = new FormData();
    body.set("entryId", entryId);
    body.set("image", photo.pending.file);
    const res = await fetch("/api/admin/content/sponsors/photo", {
      method: "POST",
      body,
    });
    setUploading(false);
    if (res.ok) {
      // The record saved even if this had failed, so the two outcomes are
      // reported separately rather than as one "saved" or "failed".
      photo.clear();
    } else {
      toast.push(
        "error",
        "The record saved, but the logo did not upload. Open it again and retry.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {rows.length === 0 && (
        <InfoBanner>
          Nobody signed yet, so the public sponsor strip is hidden. Adding the
          first sponsor here brings it back.
        </InfoBanner>
      )}

      <InfoBanner>
        Logos with a transparent background now stay transparent — re-upload any
        sponsor logo saved before today&rsquo;s fix if it still shows a black
        box behind it (the Google logo does; that is the exact bug this fixed).
      </InfoBanner>

      <EntityCrud<Sponsor>
        collection="sponsors"
        rows={rows}
        addLabel="Add a sponsor"
        emptyLabel="No sponsors confirmed yet."
        reorderable
        afterSave={(saved) => uploadPending(saved.id)}
        onClose={photo.clear}
        blank={() => ({
          id: "",
          name: "",
          logoUrl: "",
          tier: "community",
          websiteUrl: "",
        })}
        renderRow={(row) => (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black02/15 bg-pastel">
              {row.logoUrl && !row.logoUrl.startsWith("/placeholders/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.logoUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="font-mono text-caption text-black02/65">
                  logo
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-sans text-body-m font-bold text-black02">
                {row.name}
              </p>
              <p className="truncate text-caption capitalize text-black02/65">
                {row.tier ?? "community"}
                {!row.blurb?.en && !row.blurb?.fr && " · no blurb"}
              </p>
            </div>
          </div>
        )}
        renderForm={(draft, patch) => (
          <>
            <Field label="Name">
              <TextInput
                value={draft.name}
                onChange={(name) =>
                  patch(draft.logoUrl ? { name } : { name, id: slugify(name) })
                }
              />
            </Field>

            <Field label="Id">
              <TextInput value={draft.id} onChange={(id) => patch({ id })} />
            </Field>

            <Field label="Tier">
              <Segmented
                name="sponsor-tier"
                value={draft.tier ?? "community"}
                options={TIERS}
                onChange={(tier) => patch({ tier })}
              />
            </Field>

            <Field label="Logo">
              <ImageField
                url={draft.logoUrl}
                name={draft.name}
                busy={uploading}
                preview={photo.pending?.preview}
                onPick={photo.pick}
              />
            </Field>

            <Field
              label="Website"
              hint="Where their logo links. Opens in a new tab on the public site."
            >
              <TextInput
                value={draft.websiteUrl ?? ""}
                onChange={(websiteUrl) =>
                  patch({ websiteUrl: websiteUrl || undefined })
                }
              />
            </Field>

            <Field
              label="Blurb"
              hint="Shown in the popup that follows the cursor over their logo (and inline on touch). Optional — empty just shows the name."
            >
              <LocalizedInput
                value={draft.blurb ?? { ...EMPTY }}
                onChange={(blurb) =>
                  patch({ blurb: blurb.fr || blurb.en ? blurb : undefined })
                }
              />
            </Field>
          </>
        )}
      />
    </div>
  );
}
