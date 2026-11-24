import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CheckCircle,
  Prohibit,
  Question,
} from "@phosphor-icons/react/dist/ssr";
import { SectionContainer } from "@/components/ui/SectionContainer";
import {
  isCertificateId,
  normaliseCertificateId,
  type CertificateRole,
} from "@/lib/certificates/rules";
import { pageMetadata } from "@/lib/seo";
import { createAdminSupabase } from "@/lib/supabase/server";

/** One certificate per request, read fresh: a revocation shows at once. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "pages.certificate" });
  return pageMetadata({
    locale,
    path: `/certificates/${encodeURIComponent(normaliseCertificateId(id))}`,
    title: t("metaTitle"),
    description: t("metaDesc"),
    // A certificate is someone's name: never in a search engine.
    index: false,
  });
}

type Found = {
  full_name: string;
  role: CertificateRole;
  detail: string | null;
  edition: number;
  issued_at: string;
  revoked_at: string | null;
};

/** One row by its exact id — nothing lists or searches the table. */
async function lookUp(id: string): Promise<Found | null> {
  if (!isCertificateId(id)) return null;
  try {
    const { data, error } = await createAdminSupabase()
      .from("certificates")
      .select("full_name, role, detail, edition, issued_at, revoked_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      // Before migration 0048 the table is missing: reads as "not found".
      if (
        !/does not exist|could not find|PGRST205|42P01/i.test(
          `${error.code} ${error.message}`,
        )
      ) {
        console.error("[certificates] lookup failed", error.message);
      }
      return null;
    }
    return (data as Found | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * `/{locale}/certificates/<id>` — where the QR code on a DevFest Yaoundé
 * certificate leads (ADR 0100). It says whether the certificate is genuine,
 * and to whom and for what it was issued. Nothing else: no email, no list.
 */
export default async function CertificatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: raw } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.certificate");
  const id = normaliseCertificateId(raw);
  const found = await lookUp(id);
  const issued = found
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Africa/Douala",
      }).format(new Date(found.issued_at))
    : "";

  const state = !found ? "missing" : found.revoked_at ? "revoked" : "valid";
  const Icon =
    state === "valid" ? CheckCircle : state === "revoked" ? Prohibit : Question;

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 pt-32 sm:pt-28">
      <SectionContainer background="yellow-wash" maxWidth="3xl">
        <p className="font-mono text-mono-tag font-bold uppercase text-black02/70">
          {t("eyebrow")}
        </p>
        <section
          className={`mt-6 rounded-lg border-2 border-black02 p-6 shadow-[0_6px_0_0_var(--color-black02)] sm:p-10 ${
            state === "valid" ? "bg-offwhite" : "bg-pastel"
          }`}
        >
          <p
            className={`inline-flex items-center gap-2 rounded-pill border-2 border-black02 px-4 py-1.5 font-mono text-mono-tag font-bold uppercase ${
              state === "valid"
                ? "bg-success text-offwhite"
                : state === "revoked"
                  ? "bg-danger-pastel text-black02"
                  : "bg-offwhite text-black02"
            }`}
          >
            <Icon size={18} weight="bold" aria-hidden />
            {t(
              state === "valid"
                ? "valid"
                : state === "revoked"
                  ? "revoked"
                  : "missing",
            )}
          </p>

          {found ? (
            <>
              <h1
                translate="no"
                className="mt-6 font-sans text-display-l font-bold leading-tight text-black02"
              >
                {found.full_name}
              </h1>
              <p className="mt-3 text-body-l text-black02/85">
                {t(`role.${found.role}`, { edition: found.edition })}
              </p>
              {found.detail && (
                <p className="mt-1 text-body-m text-black02/75">
                  {found.detail}
                </p>
              )}
              <dl className="mt-8 grid gap-4 border-t-2 border-black02/15 pt-6 sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-mono-tag font-bold uppercase text-black02/60">
                    {t("idLabel")}
                  </dt>
                  <dd className="font-mono text-body-l font-bold text-black02">
                    {id}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-mono-tag font-bold uppercase text-black02/60">
                    {t("issuedLabel")}
                  </dt>
                  <dd className="text-body-l text-black02">{issued}</dd>
                </div>
              </dl>
              {state === "revoked" && (
                <p className="mt-6 text-body-m text-black02/80">
                  {t("revokedBody")}
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="mt-6 font-sans text-heading-l font-bold text-black02">
                {t("missingTitle")}
              </h1>
              <p className="mt-3 max-w-prose text-body-m text-black02/80">
                {t("missingBody", { id: id.slice(0, 24) })}
              </p>
            </>
          )}
        </section>
        <p className="mt-6 max-w-prose text-caption text-black02/65">
          {t("footnote")}
        </p>
      </SectionContainer>
    </main>
  );
}
