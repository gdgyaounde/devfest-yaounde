"use client";

import {
  ArrowCounterClockwise,
  CalendarCheck,
  Trophy,
  ArrowLeft,
  CalendarBlank,
  CaretDown,
  ChartLineUp,
  ChartBar,
  ChatCircleText,
  Gear,
  Handshake,
  Image as ImageIcon,
  Images,
  List,
  Microphone,
  Package,
  Percent,
  Receipt,
  Storefront,
  Table,
  Tag,
  Ticket,
  Users,
  UsersThree,
  X,
  EnvelopeSimple,
  QrCode,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import { lockScroll } from "@/lib/scroll-source";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { DevFestLogo } from "@/components/brand/DevFestLogo";
import type { AdminData, AdminSettings, MissingPhoto } from "@/lib/admin/shape";
import { AdminOverview } from "./views/AdminOverview";
import { AdminTickets } from "./views/AdminTickets";
import { AdminPitchVote } from "./views/AdminPitchVote";
import { AdminEmails } from "./views/AdminEmails";
import { AdminTicketTiers } from "./views/AdminTicketTiers";
import { AdminShop } from "./views/AdminShop";
import { AdminTransactions } from "./views/AdminTransactions";
import { AdminOrders } from "./views/AdminOrders";
import { AdminRefundTracker } from "./views/AdminRefundTracker";
import { AdminReservations } from "./views/AdminReservations";
import { AdminDiscounts } from "./views/AdminDiscounts";
import { AdminUsers } from "./views/AdminUsers";
import { AdminContent } from "./views/AdminContent";
import { AdminWall } from "./views/AdminWall";
import { AdminConfig } from "./views/AdminConfig";
import { AdminNavTabs } from "./views/AdminNavTabs";
import { AdminSpeakers } from "./views/AdminSpeakers";
import { AdminTeam } from "./views/AdminTeam";
import { AdminSchedule } from "./views/AdminSchedule";
import { AdminSponsors } from "./views/AdminSponsors";
import { AdminTestimonials } from "./views/AdminTestimonials";
import { AdminStats } from "./views/AdminStats";
import { AdminMemoryLane } from "./views/AdminMemoryLane";
import { OrganiserAvatar } from "./OrganiserAvatar";
import { ToastProvider } from "./forms/Toast";
import type {
  Product,
  Quote,
  PastEditionPhoto,
  Session,
  Speaker,
  Sponsor,
  Stat,
  TeamMember,
  TicketTier,
} from "@/data/types";
import { PageHeader } from "./views/shared";

export interface ContentCounts {
  speakers: number;
  team: number;
  sessions: number;
  sponsors: number;
  faqs: number;
  products: number;
  tiers: number;
}

export type ViewId =
  | "overview"
  | "tickets"
  | "ticket-tiers"
  | "shop"
  | "transactions"
  | "orders"
  | "refunds"
  | "reservations"
  | "discounts"
  | "wall"
  | "testimonials"
  | "pitch-vote"
  | "users"
  | "emails"
  | "content"
  | "speakers"
  | "team"
  | "schedule"
  | "sponsors"
  | "stats"
  | "memory-lane"
  | "config";

const GROUPS: {
  label: string;
  items: {
    id: ViewId;
    label: string;
    Icon: typeof ChartBar;
  }[];
}[] = [
  {
    label: "Overview",
    items: [{ id: "overview", label: "At a glance", Icon: ChartBar }],
  },
  {
    label: "Commerce",
    items: [
      { id: "tickets", label: "Tickets", Icon: Ticket },
      { id: "ticket-tiers", label: "Ticket tiers", Icon: Tag },
      { id: "shop", label: "Shop", Icon: Storefront },
      { id: "transactions", label: "Transactions", Icon: Receipt },
      { id: "orders", label: "Shop orders", Icon: Package },
      {
        id: "refunds",
        label: "Refunds & exchanges",
        Icon: ArrowCounterClockwise,
      },
      { id: "reservations", label: "Reservations", Icon: CalendarCheck },
      { id: "discounts", label: "Discounts", Icon: Percent },
    ],
  },
  {
    label: "Community",
    items: [
      { id: "wall", label: "DP wall", Icon: ImageIcon },
      { id: "testimonials", label: "Testimonials", Icon: ChatCircleText },
      { id: "pitch-vote", label: "Pitch vote", Icon: Trophy },
      { id: "users", label: "Users", Icon: Users },
      { id: "emails", label: "Emails", Icon: EnvelopeSimple },
    ],
  },
  {
    label: "Content",
    items: [
      { id: "speakers", label: "Speakers", Icon: Microphone },
      { id: "schedule", label: "Schedule", Icon: CalendarBlank },
      { id: "team", label: "Team", Icon: UsersThree },
      { id: "sponsors", label: "Sponsors", Icon: Handshake },
      { id: "stats", label: "Figures", Icon: ChartLineUp },
      { id: "memory-lane", label: "Memory Lane", Icon: Images },
      { id: "content", label: "Bulk & photos", Icon: Table },
    ],
  },
  {
    label: "Settings",
    items: [{ id: "config", label: "Info bar & policies", Icon: Gear }],
  },
];

type NavEntry = (typeof GROUPS)[number]["items"][number];

/** One destination. Shared by the grouped items and the ungrouped ones. */
function NavItem({
  item,
  active,
  onGo,
  badge,
}: {
  item: NavEntry;
  active: boolean;
  onGo: (id: ViewId) => void;
  /** A count pill after the label — e.g. drafts still needing completion. */
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onGo(item.id)}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-pill px-3 py-2 text-left font-sans text-body-m transition-colors ${
        active
          ? "bg-primary font-bold text-black02"
          : "font-medium text-black02/70 hover:bg-pastel hover:text-black02"
      }`}
    >
      <item.Icon size={16} weight="bold" aria-hidden />
      {item.label}
      {Boolean(badge) && (
        <span
          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger px-1.5 font-mono text-caption font-bold text-offwhite"
          title={`${badge} needing completion`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/** Which group holds a view — so arriving by URL opens the right one. */
function groupOf(view: ViewId): string {
  return (
    GROUPS.find((g) => g.items.some((i) => i.id === view))?.label ??
    GROUPS[0].label
  );
}

const VIEW_IDS: ViewId[] = GROUPS.flatMap((group) =>
  group.items.map((item) => item.id),
);

/**
 * The title for every view, in ONE place.
 *
 * The CRM views used to render their own `PageHeader` on top of the one the
 * shell already renders, so those four pages carried the heading twice. The
 * shell's is the one that is guaranteed to exist for every view, so it wins,
 * and the blurbs the views were carrying moved here rather than being lost.
 */
const HEADERS: Record<ViewId, { title: string; blurb: string }> = {
  overview: {
    title: "Overview",
    blurb: "Where the edition stands today — tickets, money, wall, content.",
  },
  tickets: {
    title: "Tickets",
    blurb: "Everyone who has a badge code. Check-in still happens at the door.",
  },
  "ticket-tiers": {
    title: "Ticket tiers",
    blurb:
      "Prices, entitlements and swag for every tier. Changes reach the public tickets page as soon as they're saved.",
  },
  shop: {
    title: "Shop",
    blurb:
      "Every product on the merch store, published first. Publish or hide one straight from its row; ticket tiers pick their swag from this list.",
  },
  transactions: {
    title: "Transactions",
    blurb: "Payment intents as PawaPay reported them, including failures.",
  },
  orders: {
    title: "Shop orders",
    blurb: "Fulfilment for merch. Move a row along when you pack it.",
  },
  refunds: {
    title: "Refunds & exchanges",
    blurb:
      "Log a request that came in by email, and track it through to done. Tickets stay non-refundable; this does not move money.",
  },
  reservations: {
    title: "Reservations",
    blurb:
      "What people reserved while online payments were closed — tickets and shop items to pay for in cash at the venue. Export it for the door and for stock.",
  },
  discounts: {
    title: "Discount codes",
    blurb: "Create a code, disable one. Redemptions are not editable.",
  },
  wall: {
    title: "Community wall",
    blurb: "Click a card to hide or show it. Reported ones sit up front.",
  },
  "pitch-vote": {
    title: "Pitch vote",
    blurb:
      "The public vote for the pitch contest (powered by Impact Hub), live. Only people checked in at the door can vote, once each; results go public on /vote when it closes.",
  },
  testimonials: {
    title: "Testimonials",
    blurb:
      "The quotes in \u201cWhat people are saying\u201d on the home page. Order here is the order they rotate in. Only publish words somebody actually said — leave the name empty and the site shows \u201cCommunity member\u201d rather than a made-up one.",
  },
  users: {
    title: "Users",
    blurb: "People who signed in with Google. Addresses are masked here.",
  },
  content: {
    title: "Bulk import & photos",
    blurb:
      "Publish a whole collection from JSON or a CSV, and attach photos in bulk.",
  },
  speakers: {
    title: "Speakers",
    blurb:
      "The lineup. While this list is empty the public pages show the call for speakers instead — adding the first one switches them over.",
  },
  team: {
    title: "Team",
    blurb:
      "The organisers, as the public team page shows them. Role is their GDG position; contribution is what they did for this event — they are not the same thing, and the page groups by contribution.",
  },
  schedule: {
    title: "Schedule",
    blurb:
      "Sessions across the event day. Order here is the order on the timeline, and the day picker only offers days the event actually has.",
  },
  sponsors: {
    title: "Sponsors & partners",
    blurb:
      "Confirmed supporters. Each one fills a seat on the public strip, and their logo links to their own site.",
  },
  stats: {
    title: "Figures",
    blurb:
      "The big numbers on the home page. Order here is left to right. Give a figure an image and hovering its number on a computer turns the cursor into that picture.",
  },
  "memory-lane": {
    title: "Memory Lane",
    blurb:
      "The photo grid on the home page's Memory Lane section. Order here is the order they're shown in; with nothing here the section shows a \u201ccoming soon\u201d placeholder instead.",
  },
  emails: {
    title: "Emails",
    blurb:
      "The launch-week update, ready to send by hand — preview, download, copy, and the paid audience's recipient list. Nothing here sends email (there is no sending domain yet).",
  },
  config: {
    title: "Info bar and policies",
    blurb:
      "The announcement, the two calls, the legal links, and which tabs the navbar shows — everything the site says that is not a record in a list.",
  },
};

function parseView(raw: string | null): ViewId {
  if (raw && (VIEW_IDS as string[]).includes(raw)) return raw as ViewId;
  return "overview";
}

/**
 * The dashboard shell: grouped sidebar, URL-anchored view, back to the site.
 *
 * View lives in `?view=` so a reload keeps the place. The swap is still
 * client-side — no full reload, no second authorisation.
 */
/** The collections the CRM edits, loaded once with the rest of the page. */
export interface AdminCollections {
  speakers: Speaker[];
  team: TeamMember[];
  sessions: Session[];
  sponsors: Sponsor[];
  products: Product[];
  tiers: TicketTier[];
  quotes: Quote[];
  stats: Stat[];
  pastEditions: PastEditionPhoto[];
}

export function AdminShell({
  data,
  content,
  settings,
  missingPhotos,
  collections,
}: {
  data: AdminData;
  content: ContentCounts;
  settings: AdminSettings;
  missingPhotos: MissingPhoto[];
  collections: AdminCollections;
}) {
  const params = useSearchParams();
  // Seeded from the URL once, then owned here. Reading `params` on every
  // render would tie the view back to the router and undo the point below.
  const [view, setView] = useState<ViewId>(() => parseView(params.get("view")));

  /** "Finish this draft" deep link from another view — read once, like `view`. */
  const editId = params.get("edit") ?? undefined;

  /**
   * Listings that genuinely still NEED WORK — no price or no image — for the
   * badge on the Shop nav item.
   *
   * Not "every hidden product". That was the right count while the only
   * hidden products were auto-created swag drafts; now hiding is a deliberate
   * one-click choice from the row (ADR 0055), and a red alert on the nav for
   * every sold-out item somebody pulled would be an alarm about nothing.
   */
  const draftProductCount = collections.products.filter(
    // Ticket-only products are never priced or listed, so neither counts.
    (p) => !p.ticketOnly && (p.priceXAF <= 0 || p.images.length === 0),
  ).length;

  /**
   * The sidebar as a real drawer on a phone.
   *
   * It used to be a rounded card sitting at the top of the page with the
   * sections wrapped into pills underneath it — always there, taking a screen
   * of height before any content, and not actually usable. On a small screen
   * it is now a full-bleed drawer behind a floating button, and the layout
   * below it starts at the top of the page where it belongs.
   */
  const [drawerOpen, setDrawerOpen] = useState(false);

  /**
   * Which nav group is open. Exactly one, or none.
   *
   * Seeded from the view rather than hardcoded to the first group: landing on
   * `?view=speakers` should show Content open with Speakers marked, not
   * Commerce open and the current page nowhere to be seen. With no `?view=`
   * that resolves to Overview's group, and Overview is ungrouped, so
   * `groupOf` falls back to the topmost group — which is the "first one open"
   * behaviour asked for.
   */
  const [open, setOpen] = useState<string | null>(() =>
    groupOf(parseView(params.get("view"))),
  );

  /**
   * The sidebar's scrollbar, shown only while it is moving.
   *
   * A permanent gutter on a menu this short is a line of chrome that is
   * almost never doing anything. It fades in on scroll and back out about a
   * second after the last movement — the same bargain the public site's
   * floating scrollbar makes.
   */
  const navRef = useRef<HTMLElement>(null);
  const idle = useRef<number | null>(null);
  const onNavScroll = useCallback(() => {
    const node = navRef.current;
    if (!node) return;
    node.dataset.scrolling = "true";
    if (idle.current) window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      delete node.dataset.scrolling;
    }, 900);
  }, []);
  useEffect(
    () => () => {
      if (idle.current) window.clearTimeout(idle.current);
    },
    [],
  );

  useEffect(() => {
    document.title = "Admin · DevFest Yaoundé";
  }, []);

  /** From `lg` the sidebar is permanent, so none of the drawer rules apply. */
  const permanent = useMediaQuery("(min-width: 1024px)");
  const shown = permanent || drawerOpen;

  useEffect(() => {
    if (!drawerOpen || permanent) return;
    /*
     * `lockScroll`, not `document.body.style.overflow`.
     *
     * The document element is what scrolls here, so hiding overflow on the
     * body alone leaves the page moving under the drawer — which is exactly
     * what it did. `lockScroll` covers <html> too, and compensates for a
     * native scrollbar gutter.
     */
    const releaseScroll = lockScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      releaseScroll();
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen, permanent]);

  /**
   * Switch view, and write the URL WITHOUT navigating.
   *
   * This used to call `router.replace`. In the App Router that is a real
   * navigation: it asks the server for the route again, which re-runs the
   * admin page — six database reads, every one of them for data already
   * sitting in this component's props — before the new tab can paint.
   * Moving between tabs was therefore slower than moving between pages of
   * the public site, which is the opposite of what a dashboard should feel
   * like and exactly what was reported.
   *
   * `history.replaceState` gives the same shareable, reload-safe URL with no
   * round trip at all. Nothing on the server depends on `?view=`: the page
   * takes no `searchParams`, so there was never anything to re-render for.
   */
  function go(id: ViewId) {
    setView(id);
    setOpen(groupOf(id));
    setDrawerOpen(false);
    const next = new URLSearchParams(window.location.search);
    if (id === "overview") next.delete("view");
    else next.set("view", id);
    const query = next.toString();
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  }

  const header = HEADERS[view];

  return (
    // Every view inside can report a success or a failure the same way.
    <ToastProvider>
      <div className="min-h-screen bg-pastel px-4 pb-5 pt-20 sm:px-6 lg:pt-5">
        {/*
        The only way into the drawer on a phone, and it floats above the
        content so it is reachable from anywhere on a long table without
        scrolling back up. Hidden from `lg`, where the sidebar is permanent.
      */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={drawerOpen}
          aria-controls="admin-drawer"
          className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-pill border-2 border-black02 bg-offwhite text-black02 shadow-[0_3px_0_0_var(--color-black02)] lg:hidden"
        >
          <List size={20} weight="bold" />
        </button>

        <div className="mx-auto flex max-w-[100rem] flex-col gap-6 lg:flex-row">
          <aside className="shrink-0 lg:w-56">
            {/*
            The scrim. It fades rather than appearing, and it is what makes
            the drawer read as sitting ABOVE the page instead of replacing it.
            Tapping it closes, like every other dismissable surface here.
          */}
            <div
              aria-hidden
              onClick={() => setDrawerOpen(false)}
              className={`fixed inset-0 z-30 bg-black02/50 transition-opacity duration-300 ease-out motion-reduce:transition-none lg:hidden ${
                drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            />

            {/*
            Kept MOUNTED and slid in and out, rather than switched between
            `hidden` and `flex` — an element that does not exist cannot
            animate, which is why every open and close was instantaneous.

            `inert` while it is off-screen, so its buttons are not tabbable
            from a page that appears to be showing no menu at all. Driven by
            the media query rather than by a class, because `inert` is an
            attribute and cannot be scoped to a breakpoint.
          */}
            <div
              id="admin-drawer"
              inert={!shown}
              className={`fixed inset-0 z-40 flex flex-col overflow-y-auto overscroll-contain border-0 bg-offwhite p-5 transition-transform duration-300 ease-out motion-reduce:transition-none lg:inset-auto lg:bottom-5 lg:top-5 lg:w-56 lg:translate-x-0 lg:rounded-lg lg:border lg:border-black02/20 lg:p-4 lg:transition-none ${
                drawerOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              {/* Square on a phone: a full-bleed panel with rounded corners
                reads as a card that failed to fill the screen. */}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close admin menu"
                className="mb-4 self-end rounded-pill border-2 border-black02 p-2 text-black02 lg:hidden"
              >
                <X size={18} weight="bold" />
              </button>
              <Link
                href="/"
                className="flex items-center gap-2.5"
                aria-label="DevFest Yaoundé"
              >
                <DevFestLogo className="h-7 w-auto shrink-0" />
                <span className="font-sans text-body-m font-bold leading-tight text-black02">
                  DevFest Yaoundé
                </span>
              </Link>

              {/*
                The day-of tools (door, meal & swag, merch pickup) are their
                own lightweight routes that volunteers share (ADR 0078, 0079),
                so this is a link out rather than a view — and the loudest
                item here, because on the day it is the one people look for.
              */}
              <Link
                href="/volunteer"
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-pill border-2 border-black02 bg-primary px-4 py-2.5 font-sans text-body-m font-bold text-black02 shadow-[0_3px_0_0_var(--color-black02)] transition-transform duration-150 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none"
              >
                <QrCode size={20} weight="bold" aria-hidden />
                Day-of tools
              </Link>

              {/*
                ACCORDION, not a long scroll. Thirteen views in five groups
                is more than fits a laptop sidebar, and the old answer was to
                let it scroll — which hides half the dashboard behind a
                gesture and gives no sense of what else is there.

                One group open at a time, so the list is always about as tall
                as the screen. Opening one closes the last; the group holding
                the current view opens itself, so arriving by URL never lands
                you in a collapsed section.
              */}
              <nav
                ref={navRef}
                onScroll={onNavScroll}
                className="admin-nav mt-5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
              >
                {GROUPS.map((group) => {
                  /*
                    A single-item group is not a group. "Overview" holding one
                    entry would be a disclosure that reveals one thing —
                    two clicks to reach what should take one — so it renders
                    as a plain item.
                  */
                  if (group.items.length === 1) {
                    const item = group.items[0];
                    return (
                      <NavItem
                        key={group.label}
                        item={item}
                        active={view === item.id}
                        onGo={go}
                        badge={
                          item.id === "shop" ? draftProductCount : undefined
                        }
                      />
                    );
                  }

                  const isOpen = open === group.label;
                  return (
                    <div key={group.label}>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : group.label)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-2 rounded-pill px-3 py-2 text-left font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65 transition-colors hover:bg-pastel hover:text-black02"
                      >
                        {group.label}
                        <CaretDown
                          size={12}
                          weight="bold"
                          aria-hidden
                          className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {/*
                        grid-rows 1fr -> 0fr, the same technique the
                        announcement banner uses to animate to zero height.
                        `inert` while closed so a collapsed group's buttons
                        are not tabbable from a menu that shows nothing.
                      */}
                      <div
                        inert={!isOpen}
                        className="grid transition-[grid-template-rows] duration-250 ease-out motion-reduce:transition-none"
                        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="flex flex-col gap-1 pb-1 pl-2">
                            {group.items.map((item) => (
                              <NavItem
                                key={item.id}
                                item={item}
                                active={view === item.id}
                                onGo={go}
                                badge={
                                  item.id === "shop"
                                    ? draftProductCount
                                    : undefined
                                }
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </nav>

              {/*
                WHO IS SIGNED IN, pinned rather than scrolled past.

                It used to sit at the top under the wordmark, above a nav that
                scrolls — so on a short window it was the first thing to go.
                It is the answer to "whose audit trail is this about to be",
                which is worth having in view while you edit, so it is outside
                the scrolling area and always on screen.
              */}
              <div className="mt-3 shrink-0 border-t border-black02/15 pt-3">
                <div className="flex items-center gap-2.5 px-1">
                  <OrganiserAvatar
                    url={data.organiserAvatarUrl}
                    fallbackSource={data.organiserName ?? data.organiserEmail}
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
                      Signed in
                    </span>
                    <span
                      className="block truncate text-body-m font-bold text-black02"
                      title={data.organiserEmail ?? undefined}
                    >
                      {data.organiserEmail ?? "Organiser"}
                    </span>
                  </span>
                </div>

                <Link
                  href="/"
                  className="mt-2 inline-flex items-center gap-2 rounded-pill px-3 py-1.5 font-sans text-body-m font-bold text-black02/70 hover:bg-pastel hover:text-black02"
                >
                  <ArrowLeft size={16} weight="bold" aria-hidden />
                  Back to site
                </Link>
              </div>
            </div>
          </aside>

          <main id="main-content" className="min-w-0 flex-1 pb-16">
            <PageHeader title={header.title} blurb={header.blurb} />
            {view === "overview" && (
              <AdminOverview data={data} content={content} onGo={go} />
            )}
            {view === "tickets" && <AdminTickets data={data} />}
            {view === "ticket-tiers" && (
              <AdminTicketTiers
                rows={collections.tiers}
                data={data}
                settings={settings}
                products={collections.products}
                onGoToShop={() => go("shop")}
              />
            )}
            {view === "shop" && (
              <AdminShop
                rows={collections.products}
                data={data}
                tiers={collections.tiers}
                initialEditId={editId}
              />
            )}
            {view === "transactions" && <AdminTransactions data={data} />}
            {view === "orders" && <AdminOrders data={data} />}
            {view === "refunds" && <AdminRefundTracker data={data} />}
            {view === "reservations" && <AdminReservations data={data} />}
            {view === "discounts" && <AdminDiscounts data={data} />}
            {view === "wall" && <AdminWall data={data} />}
            {view === "stats" && <AdminStats rows={collections.stats} />}
            {view === "memory-lane" && (
              <AdminMemoryLane rows={collections.pastEditions} />
            )}
            {view === "pitch-vote" && <AdminPitchVote data={data} />}
            {view === "testimonials" && (
              <AdminTestimonials rows={collections.quotes} />
            )}
            {view === "users" && <AdminUsers data={data} />}
            {view === "emails" && <AdminEmails settings={settings} />}
            {view === "speakers" && (
              <AdminSpeakers rows={collections.speakers} />
            )}
            {view === "team" && <AdminTeam rows={collections.team} />}
            {view === "schedule" && (
              <AdminSchedule rows={collections.sessions} />
            )}
            {view === "sponsors" && (
              <AdminSponsors rows={collections.sponsors} />
            )}
            {view === "content" && (
              <AdminContent content={content} initialMissing={missingPhotos} />
            )}
            {view === "config" && (
              <div className="flex flex-col gap-5">
                <AdminNavTabs nav={settings.nav} />
                <AdminConfig
                  settings={settings}
                  speakerCount={collections.speakers.length}
                  sponsorCount={collections.sponsors.length}
                  tierCapSum={collections.tiers.reduce(
                    (sum, tier) => sum + (tier.quantityAvailable ?? 0),
                    0,
                  )}
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
