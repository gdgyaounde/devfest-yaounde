import {
  ArrowRight,
  BookOpenText,
  ForkKnife,
  ListMagnifyingGlass,
  Package,
  QrCode,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { currentStaff } from "@/lib/security/staff";
import { guideAcknowledged } from "@/lib/staff/guide-ack";
import { redirect } from "@/i18n/navigation";
import { DevFestLogo } from "@/components/brand/DevFestLogo";
import { BackupSync } from "@/components/staff/BackupSync";
import { StaffTitle } from "@/components/staff/StaffTitle";

/** First, and most important for a first-timer: how it all works, and who else is here. */
const START = [
  { href: "/volunteer/guide", key: "guide", Icon: BookOpenText, accent: true },
  { href: "/volunteer/team", key: "team", Icon: UsersThree, accent: false },
  {
    href: "/volunteer/backup",
    key: "backup",
    Icon: ListMagnifyingGlass,
    accent: false,
  },
] as const;

const TILES = [
  { href: "/volunteer/check-in", key: "door", Icon: QrCode },
  { href: "/volunteer/perks", key: "perks", Icon: ForkKnife },
  { href: "/volunteer/merch", key: "merch", Icon: Package },
] as const;

/**
 * `/{locale}/volunteer` — the day-of tools hub (ADR 0079): three big tiles,
 * who you are, and when a volunteer's access ends.
 */
export default async function VolunteerHub({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("staff.hub");
  const staff = await currentStaff();
  // The layout already gated this; a null here is a session that ended
  // between the two reads.
  if (!staff) return null;
  // A volunteer opens the guide first and confirms it; then the tools unlock
  // (ADR 0090). Organisers are exempt.
  if (!(await guideAcknowledged(staff))) {
    redirect({ href: "/volunteer/guide", locale });
  }

  const until = staff.expiresAt ? new Date(staff.expiresAt) : null;
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
      timeZone: "Africa/Douala",
      ...opts,
    });

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh bg-pastel px-4 pb-12 pt-6 sm:px-6"
    >
      <StaffTitle title={t("title")} />
      <BackupSync />
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            aria-label="DevFest Yaoundé"
          >
            <DevFestLogo className="h-7 w-auto shrink-0" />
          </Link>
          {staff.role === "organiser" && (
            <Link
              href="/admin"
              className="rounded-pill border-2 border-black02 bg-offwhite px-3.5 py-2 font-sans text-caption font-bold text-black02"
            >
              {t("dashboard")}
            </Link>
          )}
        </div>

        <div>
          <p className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
            {staff.name
              ? t("hello", { name: staff.name.split(" ")[0] })
              : t("helloAnon")}
          </p>
          <h1 className="mt-1 font-sans text-display-l font-bold leading-tight text-black02">
            {t("title")}
          </h1>
          <p className="mt-2 text-body-m text-black02/80">
            {staff.role === "organiser"
              ? t("organiserNote")
              : until
                ? t("volunteerUntil", {
                    date: fmt({
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    }).format(until),
                    time: fmt({ hour: "2-digit", minute: "2-digit" }).format(
                      until,
                    ),
                  })
                : null}
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {START.map(({ href, key, Icon, accent }) => (
            <li key={key}>
              <Link
                href={href}
                className={`group flex items-center gap-4 rounded-lg border-2 border-black02 p-4 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-1 active:shadow-none motion-reduce:transform-none ${
                  accent ? "bg-primary" : "bg-offwhite"
                }`}
              >
                <Icon
                  size={30}
                  weight="duotone"
                  aria-hidden
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-body-l font-bold leading-tight text-black02">
                    {t(`${key}Tile`)}
                  </span>
                  <span className="mt-0.5 block text-body-m text-black02/80">
                    {t(`${key}TileBody`)}
                  </span>
                </span>
                <ArrowRight
                  size={22}
                  weight="bold"
                  aria-hidden
                  className="shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>

        <ul className="flex flex-col gap-4">
          {TILES.map(({ href, key, Icon }) => (
            <li key={key}>
              <Link
                href={href}
                className="group flex items-center gap-4 rounded-lg border-2 border-black02 bg-offwhite p-5 shadow-[0_6px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_2px_0_0_var(--color-black02)] motion-reduce:transform-none"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-pill border-2 border-black02 bg-primary text-black02">
                  <Icon size={28} weight="duotone" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-heading-m font-bold leading-tight text-black02">
                    {t(`${key}Title`)}
                  </span>
                  <span className="mt-1 block text-body-m text-black02/75">
                    {t(`${key}Body`)}
                  </span>
                </span>
                <ArrowRight
                  size={24}
                  weight="bold"
                  aria-hidden
                  className="shrink-0 text-black02"
                />
              </Link>
            </li>
          ))}
        </ul>

        <p className="rounded-md border-2 border-black02/20 px-4 py-3 text-body-m text-black02/80">
          {t("help")}
        </p>
      </div>
    </main>
  );
}
