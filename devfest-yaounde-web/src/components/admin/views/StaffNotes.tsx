"use client";

import { useEffect, useState } from "react";
import { DataTable, Panel } from "./shared";

interface Notes {
  available: boolean;
  swagNotes: { name: string; tier: string; code: string; note: string }[];
  speakers: {
    name: string;
    arrivedAt: string | null;
    swagAt: string | null;
    note: string | null;
  }[];
}

const hhmm = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Douala",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

/**
 * What the day-of team wrote down (ADR 0092): swag shortages, and where each
 * speaker stands (arrived, swag). Self-fetching, organisers only.
 */
export function StaffNotes() {
  const [notes, setNotes] = useState<Notes | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/staff-notes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Notes | null) => live && setNotes(body))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!notes) return null;
  const arrived = notes.speakers.filter((s) => s.arrivedAt).length;
  return (
    <Panel
      title="Day-of notes"
      subtitle="Speaker arrivals and swag, and what ran out of a bag — as written by the volunteers."
    >
      {!notes.available && (
        <p className="mb-3 text-body-m text-black02/75">
          Not available yet — migration 0040 hasn&apos;t been applied.
        </p>
      )}
      <h3 className="mb-2 font-sans text-body-l font-bold text-black02">
        Speakers · {arrived} / {notes.speakers.length} arrived
      </h3>
      <DataTable
        compact
        headers={["Speaker", "Arrived", "Swag", "Note"]}
        empty="No speakers."
        rows={notes.speakers.map((s) => [
          s.name,
          hhmm(s.arrivedAt),
          hhmm(s.swagAt),
          s.note ?? "",
        ])}
      />
      <h3 className="mb-2 mt-6 font-sans text-body-l font-bold text-black02">
        Swag bags with something missing · {notes.swagNotes.length}
      </h3>
      <DataTable
        compact
        headers={["Attendee", "Pass", "Code", "Note"]}
        empty="No notes yet."
        rows={notes.swagNotes.map((n) => [n.name, n.tier, n.code, n.note])}
      />
    </Panel>
  );
}
