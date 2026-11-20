import { ArrowLeft, Lightbulb, Warning } from "@phosphor-icons/react/dist/ssr";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StaffTitle } from "@/components/staff/StaffTitle";

/** The sections, in reading order. Copy lives in messages `staff.guide.sections`. */
const ORDER = [
  "welcome",
  "before",
  "day",
  "door",
  "cash",
  "perks",
  "merch",
  "wrong",
  "care",
] as const;

interface Section {
  title: string;
  intro?: string;
  steps?: Record<string, string>;
  tip?: string;
  warn?: string;
}

/**
 * `/{locale}/volunteer/guide` — the volunteer guide (ADR 0089): what the day
 * is, what to do at each station, and what to do when something goes wrong,
 * in plain words and the order a volunteer meets them. Behind the same gate
 * as every volunteer page (the layout).
 */
export default async function VolunteerGuide({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("staff.guide");
  const sections = t.raw("sections") as Record<string, Section>;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh bg-pastel px-4 pb-16 pt-6 sm:px-6"
    >
      <StaffTitle title={t("title")} />
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
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
          <p className="mt-2 text-body-l text-black02/80">{t("body")}</p>
        </header>

        <nav aria-label={t("jump")}>
          <ol className="flex flex-wrap gap-2">
            {ORDER.map((key, i) => (
              <li key={key}>
                <a
                  href={`#${key}`}
                  className="inline-flex items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3 py-1.5 font-sans text-caption font-bold text-black02"
                >
                  <span className="font-mono text-black02/60">{i + 1}</span>
                  {sections[key].title.split(" — ")[0]}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {ORDER.map((key, i) => {
          const s = sections[key];
          return (
            <section
              key={key}
              id={key}
              aria-labelledby={`${key}-title`}
              className="scroll-mt-6 rounded-lg border-2 border-black02 bg-offwhite p-5 shadow-[0_6px_0_0_var(--color-black02)] sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border-2 border-black02 bg-primary font-mono text-body-m font-bold text-black02"
                >
                  {i + 1}
                </span>
                <h2
                  id={`${key}-title`}
                  className="font-sans text-heading-m font-bold leading-tight text-black02"
                >
                  {s.title}
                </h2>
              </div>
              {s.intro && (
                <p className="mt-3 text-body-m leading-relaxed text-black02/85">
                  {s.intro}
                </p>
              )}
              {s.steps && (
                <ol className="mt-4 flex flex-col gap-3">
                  {Object.entries(s.steps).map(([k, text], n) => (
                    <li key={k} className="flex gap-3">
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border-2 border-black02 font-mono text-caption font-bold text-black02"
                      >
                        {n + 1}
                      </span>
                      <span className="text-body-m leading-relaxed text-black02">
                        {text}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {s.tip && (
                <p className="mt-4 flex gap-2.5 rounded-md bg-primary/30 px-4 py-3 text-body-m text-black02">
                  <Lightbulb
                    size={20}
                    weight="duotone"
                    aria-hidden
                    className="mt-0.5 shrink-0"
                  />
                  <span>{s.tip}</span>
                </p>
              )}
              {s.warn && (
                <p className="mt-4 flex gap-2.5 rounded-md border-2 border-black02 bg-pastel px-4 py-3 text-body-m font-bold text-black02">
                  <Warning
                    size={20}
                    weight="duotone"
                    aria-hidden
                    className="mt-0.5 shrink-0"
                  />
                  <span>{s.warn}</span>
                </p>
              )}
            </section>
          );
        })}

        <Link
          href="/volunteer"
          className="inline-flex w-fit items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-5 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)]"
        >
          <ArrowLeft size={18} weight="bold" aria-hidden />
          {t("back")}
        </Link>
      </div>
    </main>
  );
}
