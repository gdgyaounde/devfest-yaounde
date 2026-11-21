import { Broadcast, Megaphone, MapPin } from "@phosphor-icons/react/dist/ssr";
import { getTranslations } from "next-intl/server";
import { MorphedImageFrame } from "@/components/ui/MorphedImageFrame";
import type { UpNextItem } from "@/lib/up-next";

/**
 * "Up next" — the sessions the organisers are pointing at right now, pinned
 * above the programme (ADR 0097). Flat yellow card, one per session, with the
 * room made large because that is what people are looking for.
 */
export async function UpNextStrip({
  now,
  next,
  locale,
}: {
  now: UpNextItem[];
  next: UpNextItem[];
  locale: "fr" | "en";
}) {
  if (now.length === 0 && next.length === 0) return null;
  const t = await getTranslations("pages.schedule.upNext");

  return (
    <div className="mt-12 flex flex-col gap-10">
      {now.length > 0 && (
        <Row
          id="going-on-now"
          title={t("now")}
          icon={<Broadcast size={18} weight="fill" aria-hidden />}
          tone="bg-green-pastel"
          items={now}
          locale={locale}
        />
      )}
      {next.length > 0 && (
        <Row
          id="coming-up-next"
          title={t("next")}
          icon={<Megaphone size={18} weight="bold" aria-hidden />}
          tone="bg-yellow"
          items={next}
          locale={locale}
        />
      )}
    </div>
  );
}

function Row({
  id,
  title,
  icon,
  tone,
  items,
  locale,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  tone: string;
  items: UpNextItem[];
  locale: "fr" | "en";
}) {
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className={`inline-flex items-center gap-2 rounded-pill border-2 border-black02 px-4 py-1.5 font-mono text-mono-tag font-bold uppercase text-black02 ${tone}`}
      >
        {icon}
        {title}
      </h2>
      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {items.map(({ session, speakers, room }) => (
          <li
            key={session.id}
            className="flex flex-col gap-4 rounded-lg border-2 border-black02 bg-pastel p-5 shadow-[0_5px_0_0_var(--color-black02)]"
          >
            {room && (
              <p className="inline-flex w-fit items-center gap-2 rounded-pill bg-black02 px-3 py-1 font-mono text-mono-tag font-bold uppercase text-offwhite">
                <MapPin size={16} weight="fill" aria-hidden />
                {room[locale]}
              </p>
            )}
            <h3 className="font-sans text-heading-m font-bold leading-tight text-black02">
              {session.title[locale]}
            </h3>
            <ul className="mt-auto flex flex-col gap-3">
              {speakers.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <div className="w-12 shrink-0">
                    <MorphedImageFrame
                      src={p.photoUrl}
                      alt={p.name}
                      shape="circle"
                      sizes="48px"
                    />
                  </div>
                  <p className="text-body-m font-bold text-black02">
                    {p.name}
                    {p.company && (
                      <span className="block text-caption font-normal text-black02/70">
                        {p.company}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
