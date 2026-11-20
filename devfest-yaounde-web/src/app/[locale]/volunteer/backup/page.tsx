import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireGuide } from "@/lib/staff/guide-ack";
import { BackupList } from "@/components/staff/BackupList";
import { StaffTitle } from "@/components/staff/StaffTitle";

/**
 * `/{locale}/volunteer/backup` — the offline backup list (ADR 0090).
 *
 * A deliberately DATA-FREE shell: nothing personal is rendered by the server
 * here (the list is fetched into the phone and drawn client-side), which is
 * what makes it safe for the service worker to keep this one page for offline
 * use. Behind the same staff gate as every volunteer page (the layout).
 */
export default async function VolunteerBackup({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuide(locale);
  const t = await getTranslations("staff.backup");
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh bg-pastel px-4 pb-16 pt-6 sm:px-6"
    >
      <StaffTitle title={t("title")} />
      <div className="mx-auto flex max-w-md flex-col gap-5">
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
        </header>
        <BackupList />
      </div>
    </main>
  );
}
