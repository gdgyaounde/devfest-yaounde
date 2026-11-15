/**
 * Day-of staff authorisation (ADR 0079): organisers AND volunteers.
 *
 * `currentOrganiser()` stays the gate for the dashboard and anything that
 * reads or changes data broadly. This is the gate for the narrow day-of
 * routes only — door check-in, meal/swag hand-out, merch pickup — which an
 * active volunteer may also use.
 *
 * Organisers are checked first (an organiser is always staff); then a
 * `volunteers` row that has not expired. Both lookups go through the service
 * role and FAIL CLOSED: a database error hands out nothing.
 */
import "server-only";
import { googleDisplayName } from "@/lib/admin/avatar";
import { isVolunteerActive, type StaffRole } from "@/lib/staff/rules";
import { createAdminSupabase, currentUser } from "@/lib/supabase/server";

export interface StaffContext {
  userId: string;
  role: StaffRole;
  name: string | null;
  /** Volunteers only: when their access ends. */
  expiresAt: string | null;
}

export async function currentStaff(): Promise<StaffContext | null> {
  const user = await currentUser();
  if (!user) return null;

  const supabase = createAdminSupabase();
  const name = googleDisplayName(user.user_metadata);

  const organiser = await supabase
    .from("organisers")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (organiser.error) {
    console.error("[staff] organiser lookup failed", organiser.error.message);
    return null;
  }
  if (organiser.data) {
    return { userId: user.id, role: "organiser", name, expiresAt: null };
  }

  const volunteer = await supabase
    .from("volunteers")
    .select("expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (volunteer.error) {
    // Includes "relation does not exist" before migration 0032 is applied.
    console.error("[staff] volunteer lookup failed", volunteer.error.message);
    return null;
  }
  if (
    !volunteer.data ||
    !isVolunteerActive(volunteer.data.expires_at, new Date())
  ) {
    return null;
  }
  return {
    userId: user.id,
    role: "volunteer",
    name,
    expiresAt: volunteer.data.expires_at,
  };
}
