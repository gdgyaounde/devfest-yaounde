import "server-only";
import { googleAvatarUrl, googleDisplayName } from "@/lib/admin/avatar";
import { isVolunteerActive } from "@/lib/staff/rules";
import { createAdminSupabase } from "@/lib/supabase/server";

export interface TeamMember {
  id: string;
  /** The Google display name — a volunteer needs to find a person on the day. */
  name: string;
  avatarUrl: string | null;
  role: "organiser" | "volunteer";
}

/**
 * The day-of team, for the volunteers' own eyes (ADR 0089): organisers and
 * active volunteers, by NAME AND PHOTO ONLY. No email, no phone, no sign-in
 * details — a name is what you need to find someone on the day.
 *
 * Fails closed to an empty list: a database error shows nobody rather than
 * leaking anything, and the page says so.
 */
export async function loadTeam(): Promise<TeamMember[]> {
  const db = createAdminSupabase();
  const [organisers, volunteers] = await Promise.all([
    db.from("organisers").select("user_id"),
    db.from("volunteers").select("user_id, expires_at"),
  ]);
  if (organisers.error) {
    console.error("[team] organisers read failed", organisers.error.message);
  }
  if (volunteers.error) {
    console.error("[team] volunteers read failed", volunteers.error.message);
  }

  const now = new Date();
  const roles = new Map<string, TeamMember["role"]>();
  for (const v of volunteers.data ?? []) {
    if (isVolunteerActive(v.expires_at, now)) roles.set(v.user_id, "volunteer");
  }
  // An organiser who is also on the volunteer list shows once, as an organiser.
  for (const o of organisers.data ?? []) roles.set(o.user_id, "organiser");

  const members = await Promise.all(
    [...roles].map(async ([id, role]): Promise<TeamMember | null> => {
      try {
        const { data, error } = await db.auth.admin.getUserById(id);
        if (error || !data.user) return null;
        const meta = data.user.user_metadata;
        return {
          id,
          name: googleDisplayName(meta) ?? "—",
          avatarUrl: googleAvatarUrl(meta),
          role,
        };
      } catch {
        return null;
      }
    }),
  );
  return members
    .filter((m): m is TeamMember => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
