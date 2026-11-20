import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminData } from "@/lib/admin/data";
import type { MissingPhoto } from "@/lib/admin/shape";
import { isPlaceholderPhoto } from "@/lib/content/photos";
import { loadSettings } from "@/lib/content/settings";
import {
  collectionCounts,
  getAllSessions,
  getAllSpeakers,
  getSponsors,
  getAllTeam,
  getAllProducts,
  getAllQuotes,
  getStats,
  getPastEditions,
  getTiers,
} from "@/lib/content/store";

/**
 * `/{locale}/admin` — the whole dashboard, in one server render.
 *
 * ONE ROUTE, not a route per view. The shell swaps views on the client, so
 * moving between Tickets and Orders is instant rather than a round trip —
 * which is what an internal tool being used at a door, on a phone, on venue
 * wifi, actually needs.
 *
 * The cost is that everything loads up front, so the reads are capped
 * (`LIST_CAP`) and the UI says "showing N of M" rather than implying it has
 * everything. For a first DevFest that ceiling is the whole dataset several
 * times over; past that these become paginated queries and the shell keeps
 * working.
 *
 * ENGLISH ONLY, deliberately. It is an internal tool, and translating it
 * would be effort spent on the one surface no attendee sees. The content it
 * DISPLAYS is still bilingual data, shown in both languages where it has two.
 */
export default async function AdminPage() {
  const [
    data,
    counts,
    settings,
    speakers,
    team,
    sponsors,
    sessions,
    products,
    tiers,
    quotes,
    stats,
    pastEditions,
  ] = await Promise.all([
    loadAdminData(),
    collectionCounts(),
    loadSettings(),
    getAllSpeakers(),
    getAllTeam(),
    getSponsors(),
    getAllSessions(),
    getAllProducts(),
    getTiers(),
    getAllQuotes(),
    getStats(),
    getPastEditions(),
  ]);

  const missingPhotos: MissingPhoto[] = [
    ...speakers
      .filter((row) => isPlaceholderPhoto(row.photoUrl))
      .map((row) => ({
        collection: "speakers",
        collectionLabel: "Speakers",
        id: row.id,
        name: row.name,
      })),
    ...team
      .filter((row) => isPlaceholderPhoto(row.photoUrl))
      .map((row) => ({
        collection: "team",
        collectionLabel: "Team",
        id: row.id,
        name: row.name,
      })),
    ...sponsors
      .filter((row) => isPlaceholderPhoto(row.logoUrl))
      .map((row) => ({
        collection: "sponsors",
        collectionLabel: "Sponsors",
        id: row.id,
        name: row.name,
      })),
  ];

  return (
    <Suspense fallback={<div className="min-h-screen bg-pastel" />}>
      <AdminShell
        data={data}
        settings={settings}
        missingPhotos={missingPhotos}
        collections={{
          speakers,
          team,
          sessions,
          sponsors,
          products,
          tiers,
          quotes,
          stats,
          pastEditions,
        }}
        content={{
          speakers: counts.speakers,
          team: counts.team,
          sessions: counts.sessions,
          sponsors: counts.sponsors,
          faqs: counts.faqs,
          products: counts.products,
          tiers: counts["ticket-tiers"],
        }}
      />
    </Suspense>
  );
}
