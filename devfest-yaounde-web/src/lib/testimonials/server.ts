import "server-only";
import { createAdminSupabase } from "@/lib/supabase/server";
import { storyOrder, type PublicTestimonial } from "./rules";

/**
 * The approved testimonials, in story order (oldest edition first). Never
 * throws: before migration 0039, or with the database down, it is an empty
 * reel rather than a broken wall.
 */
export async function readApprovedTestimonials(): Promise<PublicTestimonial[]> {
  try {
    const { data, error } = await createAdminSupabase()
      .from("testimonials")
      .select("id, message, role, edition, locale, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) {
      console.error("[testimonials] read failed", error.message);
      return [];
    }
    return storyOrder(
      (data ?? []).map((r) => ({
        id: r.id,
        message: r.message,
        role: r.role,
        edition: r.edition,
        locale: (r.locale === "en" ? "en" : "fr") as "fr" | "en",
        createdAt: r.created_at,
      })),
    ).map((row) => ({
      id: row.id,
      message: row.message,
      role: row.role,
      edition: row.edition,
      locale: row.locale,
    }));
  } catch (err) {
    console.error("[testimonials] store unavailable", err);
    return [];
  }
}
