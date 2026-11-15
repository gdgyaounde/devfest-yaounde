"use client";

import { useState } from "react";
import type { PastEditionPhoto } from "@/data/types";
import { EntityCrud } from "../forms/EntityCrud";
import {
  Field,
  ImageField,
  LocalizedInput,
  TextInput,
  usePendingPhoto,
} from "../forms/fields";
import { useToast } from "../forms/Toast";
import { InfoBanner } from "./shared";

const EMPTY = { fr: "", en: "" };

/**
 * Memory Lane's photo grid — the first real admin screen for the
 * `past-editions` collection (PHASE22 §A7). The collection, its schema and
 * its photo-upload wiring already existed (ADR 0031/0032); what was missing
 * was a place in the dashboard to use them, so this section only ever
 * showed the seed placeholders.
 *
 * On `EntityCrud`, so it gets the whole-array save with concurrency check
 * and audit entry, and the typed-id delete confirmation, like every list.
 * Reorderable — the grid on the home page renders in this order.
 */
export function AdminMemoryLane({ rows }: { rows: PastEditionPhoto[] }) {
  const toast = useToast();
  const photo = usePendingPhoto();
  const [uploading, setUploading] = useState(false);

  async function uploadPending(entryId: string) {
    if (!photo.pending) return;
    setUploading(true);
    const body = new FormData();
    body.set("entryId", entryId);
    body.set("image", photo.pending.file);
    const res = await fetch("/api/admin/content/past-editions/photo", {
      method: "POST",
      body,
    });
    setUploading(false);
    if (res.ok) {
      photo.clear();
      return;
    }
    toast.push(
      "error",
      "The entry saved, but the photo did not upload. Open it again and retry.",
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <InfoBanner>
        Four or five portrait photos read best — Memory Lane is a taste of past
        editions, not a full album (the &ldquo;View the gallery&rdquo; link
        under Settings is where the rest lives). With nothing uploaded, the home
        page shows a &ldquo;coming soon&rdquo; placeholder instead of an empty
        grid.
      </InfoBanner>

      <EntityCrud<PastEditionPhoto>
        collection="past-editions"
        rows={rows}
        addLabel="Add a photo"
        emptyLabel="No photos yet — Memory Lane shows a “coming soon” placeholder until you add some."
        reorderable
        afterSave={(saved) => uploadPending(saved.id)}
        onClose={photo.clear}
        blank={() => ({
          id: `memory-${Date.now().toString(36)}`,
          imageUrl: "",
          alt: { ...EMPTY },
        })}
        renderRow={(row) => (
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black02/15 bg-pastel">
              {row.imageUrl && !row.imageUrl.startsWith("/placeholders/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-mono text-caption text-black02/65">
                  —
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-sans text-body-m font-bold text-black02">
                {row.alt.en || row.alt.fr || row.id}
              </p>
              <p className="truncate text-caption text-black02/65">
                {row.year ?? "no year set"}
              </p>
            </div>
          </div>
        )}
        renderForm={(draft, patch) => (
          <>
            <Field
              label="Photo"
              hint="Portrait works best — this sits in a tall polaroid frame."
            >
              <ImageField
                url={draft.imageUrl}
                name={draft.alt.en || "Photo"}
                busy={uploading}
                preview={photo.pending?.preview}
                onPick={photo.pick}
              />
            </Field>

            <Field
              label="Alt text"
              hint="What the photo shows, for anyone who can't see it. Both languages."
            >
              <LocalizedInput
                value={draft.alt}
                onChange={(alt) => patch({ alt })}
              />
            </Field>

            <Field label="Year" hint="Optional — which edition this is from.">
              <TextInput
                type="number"
                value={draft.year?.toString() ?? ""}
                onChange={(v) =>
                  patch({
                    year:
                      v.trim() === ""
                        ? undefined
                        : Math.max(2000, Number(v) || 0),
                  })
                }
              />
            </Field>

            <Field label="Id" hint="Leave it alone once it exists.">
              <TextInput value={draft.id} onChange={(id) => patch({ id })} />
            </Field>
          </>
        )}
      />
    </div>
  );
}
