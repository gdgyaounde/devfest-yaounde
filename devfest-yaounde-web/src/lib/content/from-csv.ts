/**
 * Turn a validated CSV dry-run into a speakers or team payload.
 *
 * Photos are optional here on purpose: the organiser uploads the sheet of
 * names first, then attaches pictures to whoever is still missing one.
 * Existing photoUrl values are kept when the sheet leaves the column empty.
 */
import type { Speaker, TeamMember } from "@/data/types";
import type { DryRun } from "@/lib/admin/csv";

const BLANK = { fr: "—", en: "—" };

function loc(fr: string, en: string) {
  const f = fr.trim();
  const e = en.trim();
  if (f && e) return { fr: f, en: e };
  if (f) return { fr: f, en: f };
  if (e) return { fr: e, en: e };
  return BLANK;
}

function keepPhoto(incoming: string, previous: string | undefined): string {
  const next = incoming.trim();
  if (next) return next;
  return previous ?? "";
}

export const SPEAKER_CSV_SPEC = [
  { column: "id", required: true, maxLength: 60 },
  { column: "name", required: true, maxLength: 120 },
  { column: "role_en", required: true, maxLength: 160 },
  { column: "role_fr", required: true, maxLength: 160 },
  { column: "company", maxLength: 120 },
  { column: "bio_en", maxLength: 600 },
  { column: "bio_fr", maxLength: 600 },
  { column: "photoUrl", maxLength: 300 },
  { column: "track_en", maxLength: 80 },
  { column: "track_fr", maxLength: 80 },
  { column: "day", maxLength: 2 },
];

export const TEAM_CSV_SPEC = [
  { column: "id", required: true, maxLength: 60 },
  { column: "name", required: true, maxLength: 120 },
  { column: "role_en", required: true, maxLength: 160 },
  { column: "role_fr", required: true, maxLength: 160 },
  { column: "oneLiner_en", required: true, maxLength: 240 },
  { column: "oneLiner_fr", required: true, maxLength: 240 },
  { column: "contribution_en", required: true, maxLength: 80 },
  { column: "contribution_fr", required: true, maxLength: 80 },
  { column: "photoUrl", maxLength: 300 },
];

export function speakersFromCsv(
  dry: DryRun,
  previous: Speaker[] = [],
): Speaker[] {
  const prior = new Map(previous.map((row) => [row.id, row]));
  return dry.rows.map((row) => {
    const v = row.values;
    const old = prior.get(v.id);
    const day = Number.parseInt(v.day ?? "", 10);
    return {
      id: v.id,
      name: v.name,
      role: loc(v.role_fr, v.role_en),
      company: v.company ?? "",
      photoUrl: keepPhoto(v.photoUrl ?? "", old?.photoUrl),
      bio: loc(v.bio_fr ?? "", v.bio_en ?? ""),
      track: loc(v.track_fr ?? "", v.track_en ?? ""),
      day: Number.isFinite(day) && day >= 1 ? day : (old?.day ?? 1),
      sessionIds: old?.sessionIds ?? [],
      icebreakerQuestion: old?.icebreakerQuestion ?? BLANK,
      icebreakerAnswer: old?.icebreakerAnswer ?? BLANK,
      ...(old?.funnyMoment ? { funnyMoment: old.funnyMoment } : {}),
      ...(old?.featured ? { featured: true } : {}),
      /*
        CARRIED OVER, like every other flag the sheet does not carry.

        `hidden` is not a CSV column, so a re-import that rebuilt the record
        from the sheet alone would put somebody back on the public site
        without anybody choosing to — the exact opposite of what hiding them
        was for, and silent.
      */
      ...(old?.hidden ? { hidden: true } : {}),
      ...(old?.social ? { social: old.social } : {}),
    };
  });
}

export function teamFromCsv(
  dry: DryRun,
  previous: TeamMember[] = [],
): TeamMember[] {
  const prior = new Map(previous.map((row) => [row.id, row]));
  return dry.rows.map((row) => {
    const v = row.values;
    const old = prior.get(v.id);
    return {
      id: v.id,
      name: v.name,
      role: loc(v.role_fr, v.role_en),
      oneLiner: loc(v.oneLiner_fr, v.oneLiner_en),
      contribution: loc(v.contribution_fr, v.contribution_en),
      photoUrl: keepPhoto(v.photoUrl ?? "", old?.photoUrl),
      icebreakerQuestion: old?.icebreakerQuestion ?? BLANK,
      icebreakerAnswer: old?.icebreakerAnswer ?? BLANK,
      ...(old?.funnyMoment ? { funnyMoment: old.funnyMoment } : {}),
      ...(old?.alumni ? { alumni: true } : {}),
      // See the note in `speakersFromCsv` — re-importing must not un-hide.
      ...(old?.hidden ? { hidden: true } : {}),
      ...(old?.years ? { years: old.years } : {}),
      ...(old?.social ? { social: old.social } : {}),
      // PHASE23 §B. The CSV has no columns for these, and a re-import
      // rebuilds every row — without carrying them over it would silently
      // erase every tag and join year an organiser had entered.
      ...(old?.expertise ? { expertise: old.expertise } : {}),
      ...(old?.gdgSince ? { gdgSince: old.gdgSince } : {}),
    };
  });
}
