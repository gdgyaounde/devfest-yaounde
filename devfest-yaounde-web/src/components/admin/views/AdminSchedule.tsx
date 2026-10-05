"use client";

import { useEventDates } from "@/components/global/EventDateProvider";
import type { Session, SessionKind } from "@/data/types";
import { endsAt } from "@/lib/admin/form-helpers";
import { EntityCrud } from "../forms/EntityCrud";
import {
  ChipInput,
  Field,
  LocalizedInput,
  Segmented,
  TextInput,
} from "../forms/fields";

const EMPTY = { fr: "", en: "" };

const KINDS: { value: SessionKind; label: string }[] = [
  { value: "talk", label: "Talk" },
  { value: "workshop", label: "Workshop" },
  { value: "panel", label: "Panel" },
  { value: "break", label: "Break" },
];

export function AdminSchedule({ rows }: { rows: Session[] }) {
  const eventDates = useEventDates();
  return (
    <div className="flex flex-col gap-5">
      <EntityCrud<Session>
        collection="sessions"
        rows={rows}
        addLabel="Add a session"
        emptyLabel="Nothing scheduled yet."
        reorderable
        blank={() => ({
          id: "",
          time: "09:00",
          durationMin: 30,
          day: 1,
          kind: "talk",
          title: { ...EMPTY },
          description: { ...EMPTY },
          track: { ...EMPTY },
          room: { ...EMPTY },
          tags: [],
          speakerIds: [],
        })}
        renderRow={(row) => (
          <div className="min-w-0">
            <p className="truncate font-sans text-body-m font-bold text-black02">
              <span className="font-mono text-caption text-black02/65">
                D{row.day} {row.time}
              </span>{" "}
              {row.title.en || row.id}
            </p>
            <p className="truncate text-caption text-black02/65">
              {row.kind} · {row.durationMin} min · {row.room.en}
            </p>
          </div>
        )}
        renderForm={(draft, patch) => (
          <>
            <Field label="Id" hint="Used by speakers to point at this session.">
              <TextInput value={draft.id} onChange={(id) => patch({ id })} />
            </Field>

            <Field label="Kind">
              <Segmented
                name="session-kind"
                value={draft.kind}
                options={KINDS}
                onChange={(kind) => patch({ kind })}
              />
            </Field>

            <Field label="Day">
              <Segmented
                name="session-day"
                value={String(draft.day)}
                options={eventDates.map((date, i) => ({
                  value: String(i + 1),
                  label: `Day ${i + 1} — ${new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
                }))}
                onChange={(v) => patch({ day: Number(v) })}
              />
            </Field>

            {/*
              A real time input and a duration, rather than asking for an end
              time — the data stores a start and a length, and making somebody
              subtract two clock times to enter it is how a 90-minute workshop
              becomes a 30-minute one. The computed end is shown, not stored.
            */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts" htmlFor={`time-${draft.id}`}>
                <TextInput
                  id={`time-${draft.id}`}
                  type="time"
                  value={draft.time}
                  onChange={(time) => patch({ time })}
                />
              </Field>
              <Field
                label="Duration"
                hint={`Ends at ${endsAt(draft.time, draft.durationMin)}`}
              >
                <Segmented
                  name="session-dur"
                  value={String(draft.durationMin)}
                  options={[15, 30, 45, 60, 90, 120].map((n) => ({
                    value: String(n),
                    label: `${n}m`,
                  }))}
                  onChange={(v) => patch({ durationMin: Number(v) })}
                />
              </Field>
            </div>

            <Field label="Title">
              <LocalizedInput
                value={draft.title}
                onChange={(title) => patch({ title })}
              />
            </Field>

            <Field label="Description">
              <LocalizedInput
                multiline
                value={draft.description}
                onChange={(description) => patch({ description })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Track">
                <LocalizedInput
                  value={draft.track}
                  onChange={(track) => patch({ track })}
                />
              </Field>
              <Field label="Room">
                <LocalizedInput
                  value={draft.room}
                  onChange={(room) => patch({ room })}
                />
              </Field>
            </div>

            <Field
              label="Speakers"
              hint="Speaker ids. Leave empty for a break."
            >
              <ChipInput
                values={draft.speakerIds}
                onChange={(speakerIds) => patch({ speakerIds })}
                placeholder="ama-nkeng"
              />
            </Field>

            {/*
              Tags are bilingual objects in the data, so the chip input edits
              the English and mirrors it into French rather than pretending a
              single box covers both. A translator fixes the French in the
              JSON; this at least does not silently drop it.
            */}
            <Field
              label="Tags (English)"
              hint="French copies the English until someone translates it."
            >
              <ChipInput
                values={draft.tags.map((t) => t.en)}
                onChange={(tags) =>
                  patch({
                    tags: tags.map((en, i) => ({
                      en,
                      fr: draft.tags[i]?.fr || en,
                    })),
                  })
                }
                placeholder="beginner-friendly"
              />
            </Field>

            <Field label="Bring" hint="Optional — e.g. 'bring a laptop'.">
              <LocalizedInput
                value={draft.bring ?? { ...EMPTY }}
                onChange={(bring) =>
                  patch({ bring: bring.fr || bring.en ? bring : undefined })
                }
              />
            </Field>

            <Field
              label="Provided"
              hint="Optional — e.g. 'we provide the boards'."
            >
              <LocalizedInput
                value={draft.provided ?? { ...EMPTY }}
                onChange={(provided) =>
                  patch({
                    provided: provided.fr || provided.en ? provided : undefined,
                  })
                }
              />
            </Field>
          </>
        )}
      />
    </div>
  );
}
