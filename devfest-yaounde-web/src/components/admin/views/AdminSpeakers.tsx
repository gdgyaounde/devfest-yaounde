"use client";

import { useState } from "react";
import { useEventDates } from "@/components/global/EventDateProvider";
import type { Speaker } from "@/data/types";
import { slugify } from "@/lib/admin/form-helpers";
import { EntityCrud } from "../forms/EntityCrud";
import {
  ChipInput,
  Field,
  FilterBar,
  ImageField,
  LocalizedInput,
  Segmented,
  SocialLinks,
  TextInput,
  Toggle,
  usePendingPhoto,
} from "../forms/fields";
import { useToast } from "../forms/Toast";
import { InfoBanner } from "./shared";

const EMPTY = { fr: "", en: "" };

export function AdminSpeakers({ rows }: { rows: Speaker[] }) {
  const eventDates = useEventDates();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const photo = usePendingPhoto();
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("all");
  const [shown, setShown] = useState("all");
  const [live, setLive] = useState("all");

  /*
    Matches on what somebody would actually type to find a speaker: their
    name, their company, or the id if they are looking at a URL. Not the bio —
    a search that matches on a paragraph returns half the list.
  */
  const matches = (row: Speaker) => {
    const q = query.trim().toLowerCase();
    if (
      q &&
      ![row.name, row.company, row.id].some((v) => v?.toLowerCase().includes(q))
    )
      return false;
    if (day !== "all" && String(row.day) !== day) return false;
    if (shown === "featured" && !row.featured) return false;
    if (live === "live" && row.hidden) return false;
    if (live === "hidden" && !row.hidden) return false;
    return true;
  };

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
    const res = await fetch("/api/admin/content/speakers/photo", {
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
        "The record saved, but the picture did not upload. Open it again and retry.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {rows.length === 0 && (
        <InfoBanner>
          No speakers yet, so `/speakers` and the home section are showing the
          call for speakers. Add one here and they switch to the lineup.
        </InfoBanner>
      )}

      <EntityCrud<Speaker>
        collection="speakers"
        rows={rows}
        filter={matches}
        toolbar={
          <FilterBar
            query={query}
            onQuery={setQuery}
            placeholder="Search name or company"
            chips={[
              {
                label: "Day",
                value: day,
                onChange: setDay,
                options: [
                  { value: "all", label: "All days" },
                  ...eventDates.map((_, i) => ({
                    value: String(i + 1),
                    label: `Day ${i + 1}`,
                  })),
                ],
              },
              {
                label: "Featured",
                value: shown,
                onChange: setShown,
                options: [
                  { value: "all", label: "All" },
                  { value: "featured", label: "Featured" },
                ],
              },
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
            on ? "Back on the site." : "Hidden from the site — still here.",
        }}
        addLabel="Add a speaker"
        afterSave={(saved) => uploadPending(saved.id)}
        onClose={photo.clear}
        emptyLabel="No speakers announced yet."
        blank={() => ({
          id: "",
          name: "",
          role: { ...EMPTY },
          company: "",
          photoUrl: "",
          bio: { ...EMPTY },
          track: { ...EMPTY },
          day: 1,
          sessionIds: [],
          social: {},
          icebreakerQuestion: { ...EMPTY },
          icebreakerAnswer: { ...EMPTY },
        })}
        renderRow={(row) => (
          <div className="min-w-0">
            <p className="truncate font-sans text-body-m font-bold text-black02">
              {row.name}
              {row.featured && (
                <span className="ml-2 rounded-pill bg-primary px-2 py-0.5 font-mono text-caption font-bold uppercase text-black02">
                  featured
                </span>
              )}
            </p>
            <p className="truncate text-caption text-black02/65">
              {row.role.en} · {row.company} · day {row.day}
            </p>
          </div>
        )}
        renderForm={(draft, patch) => (
          <>
            <Field label="Name">
              <TextInput
                value={draft.name}
                onChange={(name) =>
                  patch(
                    draft.company || draft.bio.en
                      ? { name }
                      : { name, id: slugify(name) },
                  )
                }
              />
            </Field>

            <Field
              label="Id"
              hint="Used in URLs. Do not change it once it exists."
            >
              <TextInput value={draft.id} onChange={(id) => patch({ id })} />
            </Field>

            <Field label="Role">
              <LocalizedInput
                value={draft.role}
                onChange={(role) => patch({ role })}
              />
            </Field>

            <Field label="Company">
              <TextInput
                value={draft.company}
                onChange={(company) => patch({ company })}
              />
            </Field>

            <Field label="Photo">
              <ImageField
                url={draft.photoUrl}
                name={draft.name}
                busy={uploading}
                preview={photo.pending?.preview}
                onPick={photo.pick}
              />
            </Field>

            <Field label="Bio">
              <LocalizedInput
                multiline
                value={draft.bio}
                onChange={(bio) => patch({ bio })}
              />
            </Field>

            <Field label="Track" hint="Drives the filter on /speakers.">
              <LocalizedInput
                value={draft.track}
                onChange={(track) => patch({ track })}
              />
            </Field>

            {/*
              Days come from EVENT_DATES, so this cannot offer a day the event
              does not have — and it shows the real date rather than a number
              nobody can check.
            */}
            <Field label="Day">
              <Segmented
                name="speaker-day"
                value={String(draft.day)}
                options={eventDates.map((date, i) => ({
                  value: String(i + 1),
                  label: `Day ${i + 1} — ${new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
                }))}
                onChange={(v) => patch({ day: Number(v) })}
              />
            </Field>

            <Field label="Sessions" hint="Session ids this speaker appears in.">
              <ChipInput
                values={draft.sessionIds}
                onChange={(sessionIds) => patch({ sessionIds })}
                placeholder="opening-keynote"
              />
            </Field>

            <Field label="Links">
              <SocialLinks
                value={draft.social ?? {}}
                onChange={(social) => patch({ social })}
              />
            </Field>

            <Field label="Icebreaker question">
              <LocalizedInput
                value={draft.icebreakerQuestion}
                onChange={(icebreakerQuestion) => patch({ icebreakerQuestion })}
              />
            </Field>

            <Field label="Their answer">
              <LocalizedInput
                multiline
                value={draft.icebreakerAnswer}
                onChange={(icebreakerAnswer) => patch({ icebreakerAnswer })}
              />
            </Field>

            <Toggle
              checked={Boolean(draft.featured)}
              onChange={(v) => patch({ featured: v || undefined })}
              label="Feature on the home page"
              hint="Featured speakers appear in the slider on the front page."
            />
          </>
        )}
      />
    </div>
  );
}
