import type { Metadata, Viewport } from "next";
import { Google_Sans, Google_Sans_Code } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { EventDateProvider } from "@/components/global/EventDateProvider";
import { CustomCursor } from "@/components/global/CustomCursor";
import { FloatingScrollbar } from "@/components/global/FloatingScrollbar";
import { Footer } from "@/components/global/Footer";
import { GlobalChrome } from "@/components/global/GlobalChrome";
import { OfflineIndicator } from "@/components/global/OfflineIndicator";
import { Preloader } from "@/components/global/Preloader";
import { ServiceWorkerRegistration } from "@/components/global/ServiceWorkerRegistration";
import { routing } from "@/i18n/routing";
import { organizationJsonLd } from "@/lib/event";
import { JsonLd } from "@/lib/seo";
import { loadSettings } from "@/lib/content/settings";
import { cfsAcceptsSubmissions, cfsView } from "@/lib/content/cfs";
import { getSpeakers } from "@/lib/content/store";
import { SITE_URL } from "@/lib/site-config";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "../globals.css";

const googleSans = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const googleSansCode = Google_Sans_Code({
  variable: "--font-google-sans-code",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });

  return {
    /* Resolves relative OG/Twitter image paths. Without it Next falls back to
       localhost, which would ship broken social previews. */
    metadataBase: new URL(SITE_URL),
    /* Every page supplies its bare title and gets the suffix from here, so
       "Billets" becomes "Billets · DevFest Yaoundé" without twelve copies of
       the string — and the home page, which IS the name, does not end up
       saying it twice. */
    title: {
      default: "DevFest Yaoundé",
      template: "%s · DevFest Yaoundé",
    },
    description: t("metaDesc"),
    applicationName: "DevFest Yaoundé",
    manifest: "/manifest.webmanifest",
  };
}

/**
 * The browser chrome's colour on mobile.
 *
 * The DEFAULT yellow, not the visitor's chosen theme: this is read once when
 * the page loads, long before the theme script has run, so making it follow
 * the switcher would just make it wrong for a moment on every load.
 */
export const viewport: Viewport = {
  themeColor: "#F9AB00",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const t = await getTranslations("nav");
  const [settings, speakers] = await Promise.all([
    loadSettings(),
    getSpeakers(),
  ]);
  const custom =
    locale === "en" ? settings.announcement?.en : settings.announcement?.fr;

  /*
    The banner is the site's one loud line, and right now it has nothing to
    sell — tickets aren't open. So it carries the call for speakers instead,
    but only when there is genuinely something to click: an open window and a
    submission URL (PHASE19 Part 3).

    A message typed in the dashboard always wins. If an organiser has written
    something there, that is the thing they wanted said today, and quietly
    replacing it with our own — or hanging a "submit a talk" button off the
    side of an unrelated sentence — would be the site overruling them.
  */
  const cfs = cfsView(settings.cfs, speakers.length);
  const cfsBanner = !custom && cfsAcceptsSubmissions(cfs);
  const tCfs = await getTranslations("cfs");
  const announcementMessage =
    custom || (cfsBanner ? tCfs("banner") : undefined);
  const announcementCta = cfsBanner
    ? { href: cfs.url, label: tCfs("bannerCta") }
    : undefined;

  return (
    <html
      lang={locale}
      className={`${googleSans.variable} ${googleSansCode.variable} h-full antialiased`}
      // The pre-paint script above sets data-theme here before hydration,
      // so <html>'s attributes legitimately differ from the server render.
      suppressHydrationWarning
    >
      <head>
        {/*
          Applies the saved theme BEFORE first paint, so a visitor who chose
          e.g. Blue never sees a flash of the default Yellow. Has to be a raw
          inline script for that ordering — a client component would run
          after hydration, far too late. Content is built from a fixed
          allow-list in @/lib/theme, never from user input.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Who runs this, on every page. Nothing here is speculative, so
            unlike the Event block it is always emitted. */}
        <JsonLd data={organizationJsonLd()} />
      </head>
      {/*
        suppressHydrationWarning is scoped to <body> ONLY, and only because
        browser extensions (Grammarly is the confirmed culprit here — it
        injects data-new-gr-c-s-check-loaded / data-gr-ext-installed) mutate
        this element before React hydrates. Verified empirically: with those
        attributes simulated the warning appears, without them the console is
        clean — so there is no genuine mismatch being masked. React only
        suppresses one level deep, so real mismatches inside the tree still
        surface. See docs/setup/local-development.md.
      */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NextIntlClientProvider>
          <EventDateProvider date={settings.eventDate}>
            {/*
            Every page's `<main id="main-content">` also carries
            `tabIndex={-1}` (PHASE22 §G a11y audit) — without it, jumping the
            URL hash here scrolls `<main>` into view but does NOT move
            keyboard focus there, so a keyboard user's very next Tab would
            have resumed from the skip link itself rather than from inside
            the content the link exists to reach.
          */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-pill focus:bg-black02 focus:px-4 focus:py-2 focus:text-offwhite"
            >
              {t("skipToContent")}
            </a>
            {/* First paint, and only on a real load — the root layout does not
              remount on client navigation, so moving between pages never
              shows it again. */}
            <Preloader />
            <GlobalChrome
              announcementMessage={announcementMessage}
              announcementCta={announcementCta}
              nav={settings.nav}
            />
            <FloatingScrollbar />
            <CustomCursor />
            <ServiceWorkerRegistration />
            <OfflineIndicator />
            {/*
            The chrome is fixed-position, so page content needs its own top
            offset. Hero sections apply their own generous top padding
            (§7b spacing), so this only needs to clear the bar itself.
          */}
            <div className="flex flex-1 flex-col">{children}</div>
            <Footer />
          </EventDateProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
