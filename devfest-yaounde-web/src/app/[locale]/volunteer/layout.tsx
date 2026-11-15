import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { currentStaff } from "@/lib/security/staff";

/**
 * `/{locale}/volunteer/*` — the day-of tools (ADR 0079).
 *
 * THE GATE: organisers and active volunteers; anyone else gets a 404, for the
 * same reason the admin layout does (a 403 confirms the route exists). Every
 * API the stations call re-checks on its own — this protects pages, not data.
 *
 * Bilingual, unlike the dashboard: volunteers are ushers and helpers, not
 * the core team, and most of them will want French.
 *
 * `data-admin` borrows the dashboard's chrome suppression (no navbar, footer
 * or splash screen — globals.css). No title here, for the reason the admin
 * layout gives; each screen sets its own on mount.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function VolunteerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await currentStaff();
  if (!staff) notFound();
  return <div data-admin>{children}</div>;
}
