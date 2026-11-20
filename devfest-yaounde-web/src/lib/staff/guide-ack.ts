import "server-only";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { currentStaff, type StaffContext } from "@/lib/security/staff";

/**
 * "I have read and understood the guide" (ADR 0090): a volunteer opens the
 * guide first, confirms, and only then do the tools unlock.
 *
 * It is a first-party cookie holding the volunteer's own user id, so a phone
 * that is handed to someone else asks again. This is a courtesy to make sure
 * the guide gets read, NOT a security boundary — which is why it needs no
 * database and why the station APIs do not look at it. Organisers are exempt.
 */
export const GUIDE_COOKIE = "devfest_guide_ack";
export const GUIDE_COOKIE_MAX_AGE = 3 * 24 * 60 * 60;

export async function guideAcknowledged(staff: StaffContext): Promise<boolean> {
  if (staff.role === "organiser") return true;
  const jar = await cookies();
  return jar.get(GUIDE_COOKIE)?.value === staff.userId;
}

/** Send a volunteer who has not confirmed the guide to the guide. */
export async function requireGuide(locale: string): Promise<StaffContext> {
  const staff = await currentStaff();
  // The layout already 404s anyone who is not staff; a null is a session
  // that ended between the two reads.
  if (!staff) redirect({ href: "/volunteer", locale });
  if (!(await guideAcknowledged(staff!))) {
    redirect({ href: "/volunteer/guide", locale });
  }
  return staff!;
}
