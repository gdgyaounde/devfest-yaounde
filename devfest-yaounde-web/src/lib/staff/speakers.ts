/**
 * The speaker check-in (ADR 0092): who has arrived and who has their swag.
 * Shared by the route and the station; the rules are pure and tested.
 */
import { z } from "zod";

export interface SpeakerRow {
  id: string;
  name: string;
  company: string;
  photoUrl: string;
}

export interface SpeakerMark {
  /** ISO time they were marked arrived, or null. */
  arrivedAt: string | null;
  /** ISO time they were marked as having their swag, or null. */
  swagAt: string | null;
  note: string | null;
}

export const NOTE_MAX = 500;

export const speakerActionSchema = z.union([
  z
    .object({
      speakerId: z.string().min(1).max(120),
      action: z.enum(["arrived", "swag"]),
      on: z.boolean(),
    })
    .strict(),
  z
    .object({
      speakerId: z.string().min(1).max(120),
      action: z.literal("note"),
      note: z.string().max(NOTE_MAX),
    })
    .strict(),
]);

export type SpeakerAction = z.infer<typeof speakerActionSchema>;

/** A note, trimmed; empty means "clear it". */
export function cleanNote(input: string): string | null {
  const text = input.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
  return text === "" ? null : text;
}

/**
 * The columns an action changes. Marking something ON stamps `now`; OFF
 * clears it. Pure, so the one place the mapping lives is tested.
 */
export function patchFor(
  action: SpeakerAction,
  now: string,
): Record<string, string | null> {
  if (action.action === "note") return { note: cleanNote(action.note) };
  const stamp = action.on ? now : null;
  return action.action === "arrived"
    ? { checked_in_at: stamp }
    : { swag_collected_at: stamp };
}
