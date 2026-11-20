/**
 * GET /api/admin/staff-notes — what the day-of team wrote down (ADR 0092):
 * swag notes ("got everything except the pen") and speaker arrival / swag /
 * notes. Organisers only. Before migration 0040 the columns don't exist and
 * this answers `available: false`.
 */
import { getSpeakers } from "@/lib/content/store";
import { currentOrganiser } from "@/lib/security/organisers";
import { createAdminSupabase } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const organiser = await currentOrganiser();
  if (!organiser) {
    return Response.json(
      { error: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }
  const db = createAdminSupabase();
  const [tickets, marks, speakers] = await Promise.all([
    db
      .from("tickets")
      .select("attendee_name, tier_id, badge_code, swag_note")
      .not("swag_note", "is", null)
      .order("attendee_name")
      .limit(500),
    db
      .from("speaker_checkins")
      .select("speaker_id, checked_in_at, swag_collected_at, note"),
    getSpeakers(),
  ]);
  const available = !tickets.error && !marks.error;
  if (!available) {
    console.error(
      "[admin staff-notes]",
      tickets.error?.message,
      marks.error?.message,
    );
  }
  const name = new Map(speakers.map((s) => [s.id, s.name]));
  const markById = new Map((marks.data ?? []).map((m) => [m.speaker_id, m]));
  return Response.json(
    {
      available,
      swagNotes: (tickets.data ?? []).map((t) => ({
        name: t.attendee_name,
        tier: t.tier_id,
        code: t.badge_code,
        note: t.swag_note,
      })),
      speakers: speakers
        .map((s) => {
          const m = markById.get(s.id);
          return {
            name: name.get(s.id) ?? s.id,
            arrivedAt: m?.checked_in_at ?? null,
            swagAt: m?.swag_collected_at ?? null,
            note: m?.note ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    { headers: NO_STORE },
  );
}
