import {
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  WhatsappLogo,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import { getTranslations } from "next-intl/server";
import { mailtoHref } from "@/lib/mailto";
import { DevFestLogo } from "@/components/brand/DevFestLogo";
import { MaybeLink } from "@/components/ui/MaybeLink";
import { Reveal } from "@/components/ui/Reveal";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Link } from "@/i18n/navigation";
import { loadSettings } from "@/lib/content/settings";
import { TicketCta } from "@/components/tickets/TicketCta";
import { ticketSalesOpen } from "@/lib/event";
import {
  CHAPTER_EMAIL,
  isPlaceholderUrl,
  SOCIAL_LINKS,
} from "@/lib/site-config";

/*
 * Only the profiles that actually exist.
 *
 * Every entry is still `"#"`, so today this renders nothing at all — which is
 * the right answer: six icons that do nothing when tapped are worse than no
 * icons, and a crawler reads each one as a link to nowhere. They appear on
 * their own the moment real URLs land in `site-config.ts`.
 */
const SOCIALS = [
  { href: SOCIAL_LINKS.x, Icon: XLogo, label: "X" },
  { href: SOCIAL_LINKS.instagram, Icon: InstagramLogo, label: "Instagram" },
  { href: SOCIAL_LINKS.linkedin, Icon: LinkedinLogo, label: "LinkedIn" },
  { href: SOCIAL_LINKS.youtube, Icon: YoutubeLogo, label: "YouTube" },
  { href: SOCIAL_LINKS.facebook, Icon: FacebookLogo, label: "Facebook" },
  { href: SOCIAL_LINKS.whatsapp, Icon: WhatsappLogo, label: "WhatsApp" },
].filter(({ href }) => !isPlaceholderUrl(href));

/* `py-1.5` is not decoration: it takes a footer link from a 29px box to a
   44px one, which is the difference between a comfortable tap and a miss.
   The lists drop to `gap-1` so the visual rhythm is unchanged. */
const LINK_CLASS =
  "link-item inline-block py-1.5 text-body-l text-offwhite/85 transition-colors duration-200 hover:text-primary";

const GROUP_TITLE_CLASS =
  "font-mono text-mono-tag font-bold uppercase tracking-[0.01em] text-primary";

/** Circular filled social button (Phase 5 §9.2) — 24px Phosphor icon. */
const SOCIAL_CLASS =
  "flex h-12 w-12 items-center justify-center rounded-pill border-2 border-offwhite/25 text-offwhite transition-[background-color,color,transform,border-color] duration-200 ease-bouncy hover:-translate-y-1 hover:border-black02 hover:bg-primary hover:text-black02";

/**
 * Full-page footer — PHASE7 §7 rework.
 *
 * BEFORE: a big community-photo + RSVP CTA block on top of a plain link
 * stack. AFTER: the photo/CTA block is gone entirely and the footer is one
 * composed full-height closing moment with MIXED layout rather than a
 * single column of rows:
 *
 *   - An asymmetric two-column band: an oversized wordmark + logo flourish
 *     on the left (§7b bold typography), the three link groups on the right.
 *   - A wide "come build with us" line spanning underneath, with the ticket
 *     CTA — the event path is now tickets, not a Bevy RSVP (§4).
 *   - Social row and quiet Mono copyright bar closing it out.
 *
 * `min-h-svh` makes it a genuine full-viewport closing moment; `justify-
 * between` distributes the bands rather than letting them bunch at the top.
 *
 * "Join the Community" (Bevy) is retained here deliberately — §4 removes the
 * RSVP action but keeps community-join as a distinct purpose.
 */
export async function Footer() {
  const t = await getTranslations("footer");
  const tMail = await getTranslations("mail");
  const year = new Date().getFullYear();
  const settings = await loadSettings();
  const BEVY_URL = settings.bevyUrl;
  const legal = settings.legal;
  // The navbar's tab switches (Config → Navigation) apply here too: a tab an
  // organiser has hidden must not reappear as a footer link. The footer's own
  // other extras (Bevy, account, legal) are not navbar tabs and are unaffected.
  // The DP generator and the community wall share ONE switch (`dpGenerator`):
  // the wall is where the generator's cards land, so they show or hide as a
  // pair — never one without the other.
  const nav = settings.nav;
  const showEventGroup = nav.schedule || nav.speakers || nav.team || nav.faqs;

  return (
    <footer
      data-site-footer
      className="flex min-h-svh flex-col justify-between bg-black02 text-offwhite"
    >
      {/* ---- Band 1: wordmark flourish | link groups ---- */}
      <div className="mx-auto w-full max-w-6xl px-6 pt-24 sm:px-8 sm:pt-28">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <Reveal>
            <div>
              <DevFestLogo className="h-12 w-auto sm:h-14" title="DevFest" />
              {/* PHASE13 §6: the footer wordmark carries the same
                  click-only scramble as the page titles. Both halves get
                  their own, so "Yaoundé" decodes independently of "DevFest"
                  and each keeps its own colour. */}
              <p className="mt-7 font-sans text-display-hero font-bold leading-[0.86] text-offwhite">
                <ScrambleText text="DevFest" />
                <span className="block text-primary">
                  <ScrambleText text="Yaoundé" />
                </span>
              </p>
            </div>
          </Reveal>

          {/* Link groups — mixed into the same band, not stacked below it */}
          <Reveal index={1}>
            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:pt-6">
              {showEventGroup && (
                <div className="link-group">
                  <h2 className={GROUP_TITLE_CLASS}>{t("event.title")}</h2>
                  <ul className="mt-5 flex flex-col gap-1">
                    {nav.schedule && (
                      <li>
                        <Link href="/schedule" className={LINK_CLASS}>
                          {t("event.schedule")}
                        </Link>
                      </li>
                    )}
                    {nav.speakers && (
                      <li>
                        <Link href="/speakers" className={LINK_CLASS}>
                          {t("event.speakers")}
                        </Link>
                      </li>
                    )}
                    {nav.team && (
                      <li>
                        <Link href="/team" className={LINK_CLASS}>
                          {t("event.team")}
                        </Link>
                      </li>
                    )}
                    {nav.faqs && (
                      <li>
                        <Link href="/faqs" className={LINK_CLASS}>
                          {t("event.faqs")}
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="link-group">
                <h2 className={GROUP_TITLE_CLASS}>{t("getInvolved.title")}</h2>
                <ul className="mt-5 flex flex-col gap-1">
                  {nav.shop && (
                    <li>
                      <Link href="/shop" className={LINK_CLASS}>
                        {t("getInvolved.shop")}
                      </Link>
                    </li>
                  )}
                  {nav.dpGenerator && (
                    <>
                      <li>
                        <Link href="/dp-generator" className={LINK_CLASS}>
                          {t("getInvolved.dpGenerator")}
                        </Link>
                      </li>
                      <li>
                        <Link href="/wall" className={LINK_CLASS}>
                          {t("getInvolved.communityWall")}
                        </Link>
                      </li>
                    </>
                  )}
                  <li>
                    {/* Community join — distinct from the retired RSVP
                        action, and a different site: Bevy is where the
                        chapter's membership lives, so it opens in its own tab
                        rather than replacing the page somebody was reading. */}
                    <a
                      href={BEVY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={LINK_CLASS}
                    >
                      {t("getInvolved.community")}
                    </a>
                  </li>
                  <li>
                    {/* The only way back to a ticket, until now, was to buy
                        another one: nothing linked to /account except the
                        confirmation screen you had already navigated away
                        from. It belongs in the footer, on every page. */}
                    <Link href="/account" className={LINK_CLASS}>
                      {t("getInvolved.account")}
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="link-group">
                <h2 className={GROUP_TITLE_CLASS}>{t("legal.title")}</h2>
                {/*
                  All three are somebody else's documents — Google's policies
                  and GDG's participation terms — which is correct: the
                  chapter runs under them and does not publish its own. They
                  open in a new tab for that reason.

                  There is no separate "Code of Conduct" entry. The
                  participation terms ARE the conduct document the chapter
                  points at, and naming a second one would promise a page
                  that does not exist (ADR 0040).

                  Still `MaybeLink`: any of the three can be blanked in the
                  dashboard, and the label then renders as quiet text rather
                  than as a link that goes nowhere.
                */}
                <ul className="mt-5 flex flex-col gap-1">
                  <li>
                    <MaybeLink
                      href={legal.participationTermsUrl}
                      external
                      className={LINK_CLASS}
                      placeholderClassName="cursor-default opacity-60"
                    >
                      {t("legal.participationTerms")}
                    </MaybeLink>
                  </li>
                  <li>
                    <MaybeLink
                      href={legal.privacyUrl}
                      external
                      className={LINK_CLASS}
                      placeholderClassName="cursor-default opacity-60"
                    >
                      {t("legal.privacy")}
                    </MaybeLink>
                  </li>
                  <li>
                    <MaybeLink
                      href={legal.termsUrl}
                      external
                      className={LINK_CLASS}
                      placeholderClassName="cursor-default opacity-60"
                    >
                      {t("legal.terms")}
                    </MaybeLink>
                  </li>
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* ---- Band 2: closing invitation + ticket CTA ---- */}
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-8">
        <Reveal>
          <div className="flex flex-col items-start gap-7 border-y-2 border-offwhite/15 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-mono-tag font-bold uppercase tracking-[0.01em] text-primary">
                {t("closingLine")}
              </p>
              <p className="mt-3 max-w-xl font-sans text-display-l font-bold leading-tight text-offwhite">
                {t("rsvpCta")}
              </p>
            </div>
            {nav.tickets && (
              /* Hidden after the sales cutoff (ADR 0072), never a dead link. */
              <TicketCta
                salesCloseAt={settings.ticketing.salesCloseAt}
                salesOpenAtRender={ticketSalesOpen(new Date(), settings)}
                label={t("ticketsCta")}
                closed="hide"
              />
            )}
          </div>
        </Reveal>
      </div>

      {/* ---- Band 3: socials + quiet copyright ---- */}
      <div className="mx-auto w-full max-w-6xl px-6 pb-10 sm:px-8">
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <ThemeSwitcher />
          </div>
          {SOCIALS.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3">
              {SOCIALS.map(({ href, Icon, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className={SOCIAL_CLASS}
                >
                  <Icon size={24} />
                </a>
              ))}
            </div>
          )}
          <p className="font-mono text-caption text-offwhite/55">
            © {year} {t("copyright")}
          </p>
        </div>
        {/*
          A general contact point, visible on every page rather than buried
          inside one FAQ answer — the PHASE22 §B2 ask. `CHAPTER_EMAIL` is a
          repo constant, not a dashboard setting, so it is safe to bake into
          the translated string the same way `wall/page.tsx`'s takedown
          hint already does.
        */}
        <a
          href={mailtoHref(CHAPTER_EMAIL, {
            subject: tMail("general.subject"),
            body: tMail("general.body"),
          })}
          className="mt-6 block text-center font-mono text-caption text-offwhite/55 underline decoration-offwhite/30 underline-offset-2 transition-colors duration-200 hover:text-offwhite"
        >
          {t("contact", { email: CHAPTER_EMAIL })}
        </a>
      </div>
    </footer>
  );
}
