import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StaffTitle } from "@/components/staff/StaffTitle";
import { currentStaff } from "@/lib/security/staff";
import { loadTeam, type TeamMember } from "@/lib/staff/team";

/** First letters of the first two words, for someone with no photo. */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

/**
 * `/{locale}/volunteer/team` — who else is helping today (ADR 0089): names and
 * photos of the organisers and the active volunteers, nothing more.
 */
export default async function VolunteerTeam({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("staff.team");
  const staff = await currentStaff();
  if (!staff) return null;
  const team = await loadTeam();
  const organisers = team.filter((m) => m.role === "organiser");
  const volunteers = team.filter((m) => m.role === "volunteer");

  const Person = ({ m }: { m: TeamMember }) => (
    <li className="flex items-center gap-3 rounded-lg border-2 border-black02 bg-offwhite px-4 py-3">
      {m.avatarUrl ? (
        // Google's own avatar host only (checked in `googleAvatarUrl`).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-11 w-11 shrink-0 rounded-pill border-2 border-black02 object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border-2 border-black02 bg-primary font-mono text-body-m font-bold text-black02"
        >
          {initials(m.name)}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-sans text-body-l font-bold text-black02">
        {m.name}
      </span>
      {m.id === staff.userId && (
        <span className="shrink-0 rounded-pill border-2 border-black02 bg-primary px-2.5 py-0.5 font-mono text-mono-tag font-bold uppercase text-black02">
          {t("you")}
        </span>
      )}
    </li>
  );

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh bg-pastel px-4 pb-16 pt-6 sm:px-6"
    >
      <StaffTitle title={t("title")} />
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <Link
          href="/volunteer"
          className="inline-flex w-fit items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-4 py-2 font-sans text-body-m font-bold text-black02"
        >
          <ArrowLeft size={18} weight="bold" aria-hidden />
          {t("back")}
        </Link>
        <header>
          <h1 className="font-sans text-display-l font-bold leading-tight text-black02">
            {t("title")}
          </h1>
          <p className="mt-2 text-body-m text-black02/80">{t("intro")}</p>
          {team.length > 0 && (
            <p className="mt-2 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
              {t("count", { count: team.length })}
            </p>
          )}
        </header>

        {organisers.length > 0 && (
          <section aria-labelledby="team-organisers">
            <h2
              id="team-organisers"
              className="mb-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70"
            >
              {t("organisers")}
            </h2>
            <ul className="flex flex-col gap-3">
              {organisers.map((m) => (
                <Person key={m.id} m={m} />
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="team-volunteers">
          <h2
            id="team-volunteers"
            className="mb-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70"
          >
            {t("volunteers")}
          </h2>
          {volunteers.length === 0 ? (
            <p className="text-body-m text-black02/75">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {volunteers.map((m) => (
                <Person key={m.id} m={m} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
