/**
 * /api/staff/speakers — the speaker check-in (ADR 0092).
 *
 *   GET   → { speakers[], marks{}, available }   everyone, with their marks
 *   POST  { speakerId, action: "arrived"|"swag", on } or
 *         { speakerId, action: "note", note }    → { mark }
 *
 * Day-of staff only (organisers and active volunteers). Speakers have no QR
 * ticket: a volunteer simply marks them. Marking is undoable, because a
 * mis-tap on a name must not be permanent. The table arrives with migration
 * 0040; before it, GET says `available: false` and POST answers 503 — nothing
 * else on the site is touched.
 */
import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/admin/audit";
import { isSameOrigin } from "@/lib/admin/organiser-roles";
import { getSpeakers } from "@/lib/content/store";
import { CHECKOUT_ERRORS, errorResponse } from "@/lib/payments/errors";
import { guardStaff, NO_STORE } from "@/lib/staff/guard";
import {
  patchFor,
  speakerActionSchema,
  type SpeakerMark,
  type SpeakerRow,
} from "@/lib/staff/speakers";
import { createAdminSupabase } from "@/lib/supabase/server";

type Row = {
  speaker_id: string;
  checked_in_at: string | null;
  swag_collected_at: string | null;
  note: string | null;
};

const toMark = (r: Row): SpeakerMark => ({
  arrivedAt: r.checked_in_at,
  swagAt: r.swag_collected_at,
  note: r.note,
});

export async function GET() {
  const staff = await guardStaff("staffSearch");
  if (staff instanceof Response) return staff;

  const speakers: SpeakerRow[] = (await getSpeakers())
    .map((s) => ({
      id: s.id,
      name: s.name,
      company: s.company,
      photoUrl: s.photoUrl,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data, error } = await createAdminSupabase()
    .from("speaker_checkins")
    .select("speaker_id, checked_in_at, swag_collected_at, note");
  if (error) {
    // Includes "relation does not exist" before migration 0040.
    console.error("[staff/speakers] read failed", error.message);
    return Response.json(
      { speakers, marks: {}, available: false },
      { headers: NO_STORE },
    );
  }
  return Response.json(
    {
      speakers,
      marks: Object.fromEntries(
        (data ?? []).map((r) => [r.speaker_id, toMark(r)]),
      ),
      available: true,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  if (
    !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
  ) {
    return Response.json(
      { error: "cross_origin" },
      { status: 403, headers: NO_STORE },
    );
  }
  const staff = await guardStaff("staffSearch");
  if (staff instanceof Response) return staff;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  }
  const parsed = speakerActionSchema.safeParse(body);
  if (!parsed.success) return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 400);
  const input = parsed.data;

  // Only a speaker that exists on the programme can be marked.
  const known = (await getSpeakers()).some((s) => s.id === input.speakerId);
  if (!known) return errorResponse(CHECKOUT_ERRORS.INVALID_BODY, 404);

  const now = new Date().toISOString();
  const { data, error } = await createAdminSupabase()
    .from("speaker_checkins")
    .upsert(
      {
        speaker_id: input.speakerId,
        ...patchFor(input, now),
        updated_by: staff.userId,
        updated_at: now,
      },
      { onConflict: "speaker_id" },
    )
    .select("speaker_id, checked_in_at, swag_collected_at, note")
    .single();
  if (error || !data) {
    console.error("[staff/speakers] save failed", error?.message);
    return errorResponse(CHECKOUT_ERRORS.SERVER_ERROR, 503);
  }
  await recordAudit({
    actor: staff.userId,
    action: `speaker.${input.action}`,
    target: input.speakerId,
    after: "on" in input ? { on: input.on } : { note: true },
  });
  return Response.json({ mark: toMark(data) }, { headers: NO_STORE });
}
