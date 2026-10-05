"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminSettings, CfsOverride } from "@/lib/admin/shape";
import { isoToWatLocal, watLocalToIso } from "@/lib/admin/form-helpers";
import { cfsView } from "@/lib/content/cfs";
import { sponsorCallOpen, SPONSOR_SEATS } from "@/lib/content/sponsors";
import { EVENT, PAST_GALLERY_YEAR } from "@/lib/event";
import { ImageField, Segmented } from "../forms/fields";
import { InfoBanner, Panel } from "./shared";

const ANNOUNCE_MAX = 180;

export function AdminConfig({
  settings,
  speakerCount,
  sponsorCount,
  tierCapSum,
}: {
  settings: AdminSettings;
  /** How many speakers the store holds — what the automatic rule reads. */
  speakerCount: number;
  /** How many sponsors have signed — how many seats are still open. */
  sponsorCount: number;
  /** Sum of every tier's `quantityAvailable`, for the capacity warning. */
  tierCapSum: number;
}) {
  const router = useRouter();
  const [eventDate, setEventDate] = useState(settings.eventDate);
  const [announcementFr, setAnnouncementFr] = useState(
    settings.announcement?.fr ?? "",
  );
  const [announcementEn, setAnnouncementEn] = useState(
    settings.announcement?.en ?? "",
  );
  const [bevyUrl, setBevyUrl] = useState(settings.bevyUrl);
  const [legal, setLegal] = useState(settings.legal);
  const [heroUrl, setHeroUrl] = useState(settings.hero.imageUrl);
  const [heroBusy, setHeroBusy] = useState(false);
  const [sponsorCall, setSponsorCall] = useState(settings.sponsorCall);
  /*
    ONE state object for the whole group, not one per field — `memoryLane`
    is written to the database as a single jsonb column (site_settings.
    memory_lane), and `saveSettings` REPLACES that whole column rather than
    merging into it. Two separate `useState`s sent independently would mean
    saving a changed gallery URL could silently blank out an already-set
    current-year URL that this form never touched.
  */
  const [memoryLane, setMemoryLane] = useState(settings.memoryLane);
  const [cfsUrl, setCfsUrl] = useState(settings.cfs.url);
  const [cfsOpens, setCfsOpens] = useState(isoToWatLocal(settings.cfs.opensAt));
  const [cfsCloses, setCfsCloses] = useState(
    isoToWatLocal(settings.cfs.closesAt),
  );
  const [cfsOverride, setCfsOverride] = useState<CfsOverride>(
    settings.cfs.override,
  );
  const [capacityTotal, setCapacityTotal] = useState(
    settings.capacity.total?.toString() ?? "",
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!eventDate) {
      setError("Choose an event date.");
      return;
    }
    setStatus("saving");
    setError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(eventDate !== settings.eventDate ? { eventDate } : {}),
        announcement: {
          fr: announcementFr,
          en: announcementEn,
        },
        bevyUrl,
        legal,
        sponsorCall,
        cfs: {
          url: cfsUrl,
          opensAt: watLocalToIso(cfsOpens),
          closesAt: watLocalToIso(cfsCloses),
          override: cfsOverride,
        },
        capacity: {
          total: capacityTotal.trim() === "" ? null : Number(capacityTotal),
        },
        /*
          Sent only when it actually changed. Every other group here is
          re-sent on each save, but this one lives in a newer column
          (migration 0022): sending it unconditionally would make EVERY
          config save fail on a database that has not had that migration yet,
          over a field nobody touched.
        */
        /*
          Sent only when it actually changed, and always as the WHOLE group
          (see the note on the state above) — never sending it lets a
          database without migration 0022's column keep saving every other
          setting; sending a partial object would erase whichever field this
          form did not touch.
        */
        ...(JSON.stringify(memoryLane) !== JSON.stringify(settings.memoryLane)
          ? {
              memoryLane: {
                galleryUrl: memoryLane.galleryUrl.trim(),
                currentGalleryUrl: memoryLane.currentGalleryUrl.trim(),
              },
            }
          : {}),
      }),
    });
    if (!res.ok) {
      setStatus("error");
      setError("Could not save. Check the date and URLs, then try again.");
      return;
    }
    setStatus("saved");
    router.refresh();
  }

  /**
   * The backdrop uploads on PICK, not on save.
   *
   * Everything else on this screen is a text field that the Save button
   * writes together. An image is not: the bytes have to reach the server
   * before there is a URL to store, so the upload IS the save for this one.
   * Saying so on the control matters more than making it consistent with the
   * boxes above it — a picture that looked queued and was not would be the
   * worse surprise.
   */
  /**
   * Why the generic message became a specific one.
   *
   * This used to show "That image did not upload. JPEG, PNG or WebP, under
   * 2.5 MB." for EVERY failure, including a genuine server error — so when the
   * bucket briefly rejected WebP outright (it was created JPEG-only before
   * ADR 0047 widened it), the organiser saw the same sentence a file that was
   * simply too big would have produced, and diagnosing it needed the browser
   * console. The route already returns a specific reason in its body; reading
   * it is the fix.
   */
  const HERO_UPLOAD_ERRORS: Record<string, string> = {
    too_large: "That file is over 2.5 MB.",
    not_an_image: "That did not read as an image. Try JPEG, PNG or WebP.",
    too_big_dimensions: "That image's dimensions are too large.",
  };

  async function uploadHero(file: File) {
    setHeroBusy(true);
    const body = new FormData();
    body.set("image", file);
    const res = await fetch("/api/admin/hero-image", { method: "POST", body });
    setHeroBusy(false);
    if (!res.ok) {
      const reason = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        (reason?.error && HERO_UPLOAD_ERRORS[reason.error]) ??
          "That image did not upload. Try again, or a different file.",
      );
      setStatus("error");
      return;
    }
    const body2 = (await res.json()) as { url?: string };
    if (body2.url) setHeroUrl(body2.url);
    setStatus("saved");
  }

  const field =
    "mt-1 w-full rounded-lg border-2 border-black02 bg-offwhite px-3 py-2 font-sans text-body-m text-black02";

  /*
    What the public site would do right now, from the SAME function the public
    site calls. A settings screen that describes rules in prose is a settings
    screen that goes out of date; this one asks.

    `speakerCount` is the saved figure, not the unsaved form — the sentence
    describes the site as it stands, and the fields above it are what you are
    about to change.
  */
  const preview = cfsView(
    {
      url: cfsUrl,
      opensAt: watLocalToIso(cfsOpens),
      closesAt: watLocalToIso(cfsCloses),
      override: cfsOverride,
    },
    speakerCount,
  );
  /* Same function the hero strip calls, so this cannot describe a different site. */
  const asking = sponsorCallOpen(sponsorCall);
  const openSeats = Math.max(0, SPONSOR_SEATS - sponsorCount);
  const sponsorExplain = asking
    ? openSeats > 0
      ? `Live — the strip shows ${sponsorCount} confirmed and ${openSeats} open ${openSeats === 1 ? "seat" : "seats"}, with the CTA beside them.`
      : `Live — every seat is filled, so the strip scrolls. The CTA is still up.`
    : !sponsorCall.enabled
      ? "Switched off. The strip still shows the seats; nothing asks for them."
      : sponsorCall.prospectusUrl.trim()
        ? "The close date has passed, so the CTA is down."
        : "No prospectus URL, so there is nothing to open. Add one above.";

  const explain =
    preview.state === "lineup"
      ? `Hidden — the site is showing the speaker lineup (${speakerCount} on the list).`
      : preview.state === "waiting"
        ? "Showing as “opens soon”. Nobody can submit yet."
        : preview.state === "closed"
          ? "Showing as closed. Submissions are over and there is no lineup yet."
          : cfsUrl.trim()
            ? "Live — the call is running, on the speakers page, the home page and the banner."
            : "Open, but with no submission URL there is nothing to show. Add one above.";

  return (
    <Panel
      title="Links and configuration"
      subtitle={
        settings.source === "database"
          ? "Saved in the database — this is what the public site shows."
          : "Still the repo defaults. Save to take over."
      }
    >
      <div className="flex max-w-2xl flex-col gap-5">
        <label className="block text-body-m font-bold text-black02">
          Event date
          <input
            type="date"
            required
            className={field}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          <span className="mt-1 block text-caption font-normal text-black02/65">
            One day, in Yaoundé time. Updates the site, calendars and ticket
            receipts.
          </span>
        </label>
        <label className="block text-body-m font-bold text-black02">
          Announcement (fr)
          <textarea
            className={field}
            rows={2}
            maxLength={ANNOUNCE_MAX}
            value={announcementFr}
            onChange={(e) => setAnnouncementFr(e.target.value)}
          />
          <span className="mt-1 block text-caption font-normal text-black02/65">
            {announcementFr.length}/{ANNOUNCE_MAX}
          </span>
        </label>
        <label className="block text-body-m font-bold text-black02">
          Announcement (en)
          <textarea
            className={field}
            rows={2}
            maxLength={ANNOUNCE_MAX}
            value={announcementEn}
            onChange={(e) => setAnnouncementEn(e.target.value)}
          />
          <span className="mt-1 block text-caption font-normal text-black02/65">
            {announcementEn.length}/{ANNOUNCE_MAX}
          </span>
        </label>
        <label className="block text-body-m font-bold text-black02">
          Bevy event URL
          <input
            className={field}
            value={bevyUrl}
            onChange={(e) => setBevyUrl(e.target.value)}
          />
          <span className="mt-1 block text-caption font-normal text-black02/65">
            Where “Join the community” goes. Opens in a new tab.
          </span>
        </label>

        {/*
          Overall event capacity — a display/admin figure, independent of the
          per-tier `quantityAvailable` caps that actually gate checkout (see
          the capacity-vs-tier-caps ADR). The two can disagree; this only
          warns, never blocks a save.
        */}
        <div className="flex flex-col gap-4 rounded-lg border border-black02/15 bg-pastel/40 p-4">
          <div>
            <h3 className="font-sans text-body-l font-bold text-black02">
              Ticket capacity
            </h3>
            <p className="mt-1 text-caption text-black02/70">
              The overall figure shown publicly as a live remaining count.
              Separate from each tier&rsquo;s own cap, which checkout enforces
              on its own regardless of what is set here.
            </p>
          </div>

          <label className="block text-body-m font-bold text-black02">
            Total tickets available
            <input
              type="number"
              min={0}
              className={field}
              value={capacityTotal}
              placeholder="Leave blank to hide the public counter"
              onChange={(e) => setCapacityTotal(e.target.value)}
            />
            <span className="mt-1 block text-caption font-normal text-black02/65">
              Tier caps currently add up to {tierCapSum}.
            </span>
          </label>

          {capacityTotal.trim() !== "" &&
            tierCapSum > Number(capacityTotal) && (
              <InfoBanner tone="warn">
                Tier caps ({tierCapSum}) exceed this total ({capacityTotal}).
                Sales are not blocked by this — each tier still enforces its own
                cap — but the public counter can undercount how many tickets
                could actually still sell. Raise the total or lower a tier cap
                in Ticket tiers.
              </InfoBanner>
            )}
        </div>

        {/*
          The landing hero's backdrop. One image, sitting under the whole
          front page.
        */}
        <div className="flex flex-col gap-4 rounded-lg border border-black02/15 bg-pastel/40 p-4">
          <div>
            <h3 className="font-sans text-body-l font-bold text-black02">
              Home page background
            </h3>
            <p className="mt-1 text-caption text-black02/70">
              {heroUrl
                ? "Live on the front page, behind the wordmark."
                : "Nothing uploaded, so the hero shows the theme colour on its own — which is a finished look, not a gap."}
            </p>
          </div>

          <ImageField
            url={heroUrl}
            name="Hero"
            busy={heroBusy}
            onPick={(file) => void uploadHero(file)}
          />

          <p className="text-caption text-black02/65">
            One image — it is resized for phones and desktops automatically, so
            there is no second file to upload. Stored as WebP, so a picture with
            a transparent background keeps it and the theme colour shows
            through. It sits under a tint, so anything busy still reads.
          </p>
        </div>

        {/* Memory Lane's two album links — last edition's, and this one's. */}
        <div className="flex flex-col gap-5 rounded-lg border border-black02/15 bg-pastel/40 p-4">
          <div>
            <h3 className="font-sans text-body-l font-bold text-black02">
              Gallery links
            </h3>
            <p className="mt-1 text-caption text-black02/70">
              Shown in Memory Lane on the home page, each opening in a new tab.
              The current edition&rsquo;s also takes over the hero&rsquo;s
              ticket button once the event has passed — nobody needs to buy a
              ticket to something that already happened.
            </p>
          </div>

          <label className="block text-body-m font-bold text-black02">
            {PAST_GALLERY_YEAR} album URL
            <input
              className={field}
              value={memoryLane.galleryUrl}
              placeholder="https://photos.app.goo.gl/…"
              onChange={(e) =>
                setMemoryLane({ ...memoryLane, galleryUrl: e.target.value })
              }
            />
            <span className="mt-1 block text-caption font-normal text-black02/65">
              Last edition&rsquo;s photos. Empty hides this link rather than
              pointing it nowhere.
            </span>
          </label>

          <label className="block text-body-m font-bold text-black02">
            {EVENT.year} album URL
            <input
              className={field}
              value={memoryLane.currentGalleryUrl}
              placeholder="https://photos.app.goo.gl/…"
              onChange={(e) =>
                setMemoryLane({
                  ...memoryLane,
                  currentGalleryUrl: e.target.value,
                })
              }
            />
            <span className="mt-1 block text-caption font-normal text-black02/65">
              This edition&rsquo;s photos — there is normally nothing to put
              here until after the event. Once the event has passed, leaving
              this empty shows a &ldquo;photo album coming soon&rdquo; button
              instead of a broken link; filling it in later is enough to switch
              that button live, no other change needed.
            </span>
          </label>
        </div>

        {/*
          The sponsor call. Separate from the sponsor LIST (Content →
          Sponsors) because this is the ask, not the answer: it is up before
          anybody has signed and comes down once the deck is closed.
        */}
        <div className="flex flex-col gap-5 rounded-lg border border-black02/15 bg-pastel/40 p-4">
          <div>
            <h3 className="font-sans text-body-l font-bold text-black02">
              Become a sponsor
            </h3>
            <p className="mt-1 text-caption text-black02/70">
              {sponsorExplain}
            </p>
          </div>

          <label className="block text-body-m font-bold text-black02">
            Prospectus URL
            <input
              className={field}
              value={sponsorCall.prospectusUrl}
              placeholder="https://drive.google.com/…"
              onChange={(e) =>
                setSponsorCall({
                  ...sponsorCall,
                  prospectusUrl: e.target.value,
                })
              }
            />
            <span className="mt-1 block text-caption font-normal text-black02/65">
              The deck the CTA opens, in a new tab. Empty hides the CTA — there
              would be nothing behind it.
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-body-m font-bold text-black02">
              Closes
              <input
                type="datetime-local"
                className={field}
                value={isoToWatLocal(sponsorCall.closesAt)}
                onChange={(e) =>
                  setSponsorCall({
                    ...sponsorCall,
                    closesAt: watLocalToIso(e.target.value),
                  })
                }
              />
              <span className="mt-1 block text-caption font-normal text-black02/65">
                Yaoundé time. Empty means no deadline.
              </span>
            </label>
            <div className="text-body-m font-bold text-black02">
              Show the CTA
              <span className="mt-1.5 block">
                <Segmented
                  name="sponsor-call-enabled"
                  value={sponsorCall.enabled ? "on" : "off"}
                  options={[
                    { value: "on", label: "Yes" },
                    { value: "off", label: "No" },
                  ]}
                  onChange={(v) =>
                    setSponsorCall({ ...sponsorCall, enabled: v === "on" })
                  }
                />
              </span>
              <span className="mt-1.5 block text-caption font-normal text-black02/65">
                Off takes it down everywhere at once, deadline or not.
              </span>
            </div>
          </div>
        </div>

        {/*
          Three links, all somebody else's documents. There is no "code of
          conduct" field: the participation terms are that document for this
          chapter, and a second box would invite somebody to fill it with a
          page that does not exist (ADR 0040).
        */}
        <div className="flex flex-col gap-5 rounded-lg border border-black02/15 bg-pastel/40 p-4">
          <div>
            <h3 className="font-sans text-body-l font-bold text-black02">
              Legal links
            </h3>
            <p className="mt-1 text-caption text-black02/70">
              The small print at the bottom of the footer. Blank one and the
              label stays but stops being a link — better than a link that goes
              nowhere.
            </p>
          </div>

          <label className="block text-body-m font-bold text-black02">
            Participation terms
            <input
              className={field}
              value={legal.participationTermsUrl}
              onChange={(e) =>
                setLegal({ ...legal, participationTermsUrl: e.target.value })
              }
            />
            <span className="mt-1 block text-caption font-normal text-black02/65">
              Also what the “rules of conduct” answer in the FAQ links to.
            </span>
          </label>

          <label className="block text-body-m font-bold text-black02">
            Privacy policy
            <input
              className={field}
              value={legal.privacyUrl}
              onChange={(e) =>
                setLegal({ ...legal, privacyUrl: e.target.value })
              }
            />
          </label>

          <label className="block text-body-m font-bold text-black02">
            Terms of service
            <input
              className={field}
              value={legal.termsUrl}
              onChange={(e) => setLegal({ ...legal, termsUrl: e.target.value })}
            />
          </label>
        </div>
        {/*
          The call for speakers, which is currently what the whole speaker
          half of the site hangs off. It lives beside the announcement rather
          than in its own view because it is four fields, and because the
          banner it drives is edited two boxes above it.
        */}
        <div className="flex flex-col gap-5 rounded-lg border border-black02/15 bg-pastel/40 p-4">
          <div>
            <h3 className="font-sans text-body-l font-bold text-black02">
              Call for speakers
            </h3>
            <p className="mt-1 text-caption text-black02/70">{explain}</p>
          </div>

          <label className="block text-body-m font-bold text-black02">
            Submission URL
            <input
              className={field}
              value={cfsUrl}
              placeholder="https://sessionize.com/…"
              onChange={(e) => setCfsUrl(e.target.value)}
            />
            <span className="mt-1 block text-caption font-normal text-black02/65">
              Where the submit button sends people. With this empty the call
              never shows — there would be nowhere to click.
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-body-m font-bold text-black02">
              Opens
              <input
                type="datetime-local"
                className={field}
                value={cfsOpens}
                onChange={(e) => setCfsOpens(e.target.value)}
              />
            </label>
            <label className="block text-body-m font-bold text-black02">
              Closes
              <input
                type="datetime-local"
                className={field}
                value={cfsCloses}
                onChange={(e) => setCfsCloses(e.target.value)}
              />
            </label>
          </div>
          <p className="-mt-2 text-caption text-black02/65">
            Both in Yaoundé time, whatever clock you are reading this on. Leave
            one empty for no bound — an empty close means the countdown
            disappears and the call stays open until you change it.
          </p>

          <div className="text-body-m font-bold text-black02">
            Show the call
            <span className="mt-1.5 block">
              <Segmented
                name="cfs-override"
                value={cfsOverride}
                options={[
                  { value: "auto", label: "Automatic" },
                  { value: "force-on", label: "Always" },
                  { value: "force-off", label: "Never" },
                ]}
                onChange={setCfsOverride}
              />
            </span>
            <span className="mt-1.5 block text-caption font-normal text-black02/65">
              Automatic shows the call while the speaker list is empty and
              switches to the lineup as soon as you add one. Override it when
              the two disagree — a lineup announced before it is entered here,
              or a call reopened after the first speaker landed.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={status === "saving"}
          className="self-start rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save settings"}
        </button>
        {status === "saved" && (
          <p className="text-body-m font-bold text-black02">Saved.</p>
        )}
        {error && (
          <p className="rounded-lg border-2 border-danger bg-danger-pastel px-4 py-3 text-body-m font-bold text-black02">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
