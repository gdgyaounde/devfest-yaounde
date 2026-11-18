"use client";

import { useState } from "react";
import type { Quote } from "@/data/types";
import { EntityCrud } from "../forms/EntityCrud";
import {
  Field,
  FilterBar,
  ImageField,
  LocalizedInput,
  TextInput,
  usePendingPhoto,
} from "../forms/fields";
import { useToast } from "../forms/Toast";
import { InfoBanner } from "./shared";
import { TestimonialSubmissions } from "./TestimonialSubmissions";

const EMPTY = { fr: "", en: "" };

/**
 * Testimonials — "What people are saying" on the home page (PHASE21 §B2).
 *
 * Same shell as every other list (`EntityCrud`), so it inherits what the
 * rest of the dashboard already guarantees rather than re-implementing it:
 * the whole-array save with the concurrency check and audit entry, the
 * typed-id double confirmation on delete (ADR 0052), and the in-row
 * show/hide with the shimmer (ADR 0055).
 *
 * REORDERABLE, because order is meaningful here: it is the order the quotes
 * rotate in on the home page. That also means no Published/Hidden sections —
 * the reorder arrows move rows by array index, and a regrouped list would
 * make "move up" disagree with what is on screen.
 *
 * The avatar goes through the shared photo endpoint AFTER the save, same as
 * Team: it attaches to an entry by id, so the entry has to exist first. That
 * endpoint validates type and size and re-encodes server-side.
 */
export function AdminTestimonials({ rows }: { rows: Quote[] }) {
  const toast = useToast();
  const photo = usePendingPhoto();
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [live, setLive] = useState("all");

  const matches = (row: Quote) => {
    const q = query.trim().toLowerCase();
    if (
      q &&
      ![row.author, row.id, row.text.en, row.text.fr].some((v) =>
        v?.toLowerCase().includes(q),
      )
    )
      return false;
    if (live === "live" && row.hidden) return false;
    if (live === "hidden" && !row.hidden) return false;
    return true;
  };

  async function uploadPending(entryId: string) {
    if (!photo.pending) return;
    setUploading(true);
    const body = new FormData();
    body.set("entryId", entryId);
    body.set("image", photo.pending.file);
    const res = await fetch("/api/admin/content/quotes/photo", {
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
      "The testimonial saved, but the photo did not upload. Open it again and retry.",
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <TestimonialSubmissions />

      <h2 className="mt-4 font-sans text-heading-m font-bold text-black02">
        Home page testimonials
      </h2>
      <InfoBanner>
        Only publish words somebody actually said, with their permission. No
        name to put on it? Leave the name empty — the site shows
        &ldquo;Community member&rdquo; rather than inventing one.
      </InfoBanner>

      <EntityCrud<Quote>
        collection="quotes"
        rows={rows}
        filter={matches}
        toolbar={
          <FilterBar
            query={query}
            onQuery={setQuery}
            placeholder="Search quote, name or id"
            chips={[
              {
                label: "Visibility",
                value: live,
                onChange: setLive,
                options: [
                  { value: "all", label: "All" },
                  { value: "live", label: "On the site" },
                  { value: "hidden", label: "Hidden" },
                ],
              },
            ]}
          />
        }
        rowToggle={{
          value: (row) => !row.hidden,
          apply: (row, next) => ({ ...row, hidden: next ? undefined : true }),
          label: (on) => (on ? "Hide" : "Show"),
          saved: (on) =>
            on
              ? "Back in the rotation."
              : "Hidden from the home page — still here.",
        }}
        reorderable
        addLabel="Add a testimonial"
        emptyLabel="No testimonials yet. With none published, the home page skips the section entirely."
        afterSave={(saved) => uploadPending(saved.id)}
        onClose={photo.clear}
        blank={() => ({
          // Quotes have no natural slug — the author can be empty — so the
          // id is minted, not derived. It never changes afterwards.
          id: `quote-${Date.now().toString(36)}`,
          text: { ...EMPTY },
          author: "",
          role: { ...EMPTY },
        })}
        renderRow={(row) => (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-pill border border-black02/20 bg-pastel">
              {row.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-sans text-caption font-bold text-black02/65">
                  &ldquo;
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-sans text-body-m font-bold text-black02">
                &ldquo;{row.text.en || row.text.fr}&rdquo;
              </p>
              <p className="truncate text-caption text-black02/65">
                {row.author.trim() || "Community member"}
                {row.role?.en ? ` · ${row.role.en}` : ""}
              </p>
            </div>
          </div>
        )}
        renderForm={(draft, patch) => (
          <>
            <Field
              label="Quote"
              hint="Both languages. Keep it to a sentence or two — it is set very large."
            >
              <LocalizedInput
                multiline
                value={draft.text}
                onChange={(text) => patch({ text })}
              />
            </Field>

            <Field
              label="Name"
              hint="Optional. Empty shows “Community member” — never put a name on words that person did not say."
            >
              <TextInput
                value={draft.author}
                onChange={(author) => patch({ author })}
              />
            </Field>

            <Field
              label="Role or company"
              hint="Optional, e.g. “Attendee, 2025” or “Android dev, Acme”."
            >
              <LocalizedInput
                value={draft.role ?? { ...EMPTY }}
                onChange={(role) =>
                  patch({ role: role.fr || role.en ? role : undefined })
                }
              />
            </Field>

            <Field label="Photo" hint="Optional. Shown small, beside the name.">
              <ImageField
                url={draft.avatarUrl ?? ""}
                name={draft.author || "Q"}
                busy={uploading}
                preview={photo.pending?.preview}
                onPick={photo.pick}
              />
            </Field>

            {draft.avatarUrl && (
              <button
                type="button"
                onClick={() => patch({ avatarUrl: undefined })}
                className="w-fit rounded-pill border border-black02/20 px-3 py-1 text-caption font-bold text-black02 hover:bg-danger-pastel hover:text-danger-ink"
              >
                Remove photo
              </button>
            )}

            <Field
              label="Id"
              hint="Generated for you. Leave it alone once it exists."
            >
              <TextInput value={draft.id} onChange={(id) => patch({ id })} />
            </Field>
          </>
        )}
      />
    </div>
  );
}
