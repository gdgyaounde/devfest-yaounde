"use client";

import { X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { marqueeLoop, marqueeTrack } from "@/lib/motion";

/**
 * The top strip of the connected chrome unit (DESIGN.md §7c) — not a
 * standalone bar. Width/alignment come from the parent in GlobalChrome, so
 * this must never set its own max-width or horizontal inset.
 *
 * PAGES.md §1.2 asks for marquee scrolling on *longer* messages. Scrolling
 * unconditionally looks broken for short ones (the text sits permanently
 * mid-scroll, clipped mid-word), so a hidden probe measures the natural
 * text width and the marquee only engages when it genuinely doesn't fit.
 */
export function AnnouncementBanner({
  onDismiss,
  hidden,
  dismissible = true,
  messageKey = "message",
  messageOverride,
  cta,
}: {
  onDismiss: () => void;
  hidden: boolean;
  /**
   * The wall sets this false. There the bar is the page's ONLY chrome — it
   * carries the way back — so letting it be closed would strand someone on a
   * screen with nothing but faces on it.
   */
  dismissible?: boolean;
  /** Which announcement to run. The wall thanks the community instead. */
  messageKey?: string;
  /** Live copy from the dashboard. Falls back to the i18n file when unset. */
  messageOverride?: string;
  /**
   * An optional action beside the message — "Get tickets" while the sales
   * cutoff is the announcement (ADR 0072), the call for speakers otherwise.
   *
   * It is pinned OUTSIDE the marquee track on purpose. A link that slides
   * past is a link you have to chase, which is a poor target on a phone and
   * an unreachable one for anyone using a pointer they cannot move quickly.
   */
  cta?: { href: string; label: string; external?: boolean };
}) {
  const t = useTranslations("announcement");
  const message =
    messageOverride && messageKey === "message"
      ? messageOverride
      : t(messageKey as "message");

  const trackRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    const probe = probeRef.current;
    if (!track || !probe) return;

    const check = () => {
      setOverflows(probe.offsetWidth > track.clientWidth);
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(track);
    return () => observer.disconnect();
  }, [message]);

  return (
    <div
      // Hidden from AT and tab order once collapsed — the element still
      // exists during the height transition, so this prevents a focusable
      // dismiss button inside a zero-height box.
      aria-hidden={hidden}
      inert={hidden}
      className="relative flex items-center gap-3 border-b-2 border-black02 bg-primary px-4 py-2.5 text-black02"
    >
      {/* Hidden probe: natural single-copy width, never animated */}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap text-body-m font-bold"
      >
        {message}
      </span>

      <div
        ref={trackRef}
        className={`${marqueeTrack} min-w-0 flex-1 overflow-hidden`}
      >
        {overflows ? (
          <div
            className={`${marqueeLoop} flex w-max whitespace-nowrap`}
            style={{ ["--marquee-gap" as string]: "4rem" }}
          >
            <span className="text-body-m font-bold">{message}</span>
            <span className="text-body-m font-bold" aria-hidden>
              {message}
            </span>
          </div>
        ) : (
          <span className="block truncate text-body-m font-bold">
            {message}
          </span>
        )}
      </div>

      {cta && (
        <a
          href={cta.href}
          /* The CFS link leaves the site; the ticket link (ADR 0072) does
             not, and a new tab for an internal page is just a lost tab. */
          {...(cta.external === false
            ? {}
            : { target: "_blank", rel: "noopener noreferrer" })}
          tabIndex={hidden ? -1 : undefined}
          className="hidden shrink-0 rounded-pill border-2 border-black02 bg-offwhite px-3 py-1 font-sans text-caption font-bold text-black02 transition-transform duration-200 ease-bouncy hover:scale-105 active:scale-95 motion-reduce:transition-none sm:inline-block"
        >
          {cta.label}
        </a>
      )}

      {dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("dismiss")}
          tabIndex={hidden ? -1 : undefined}
          className="-m-3.5 shrink-0 rounded-pill p-3.5 transition-[background-color,transform] duration-200 ease-bouncy hover:scale-110 hover:bg-black02/10 active:scale-90"
        >
          <X size={16} weight="bold" />
        </button>
      )}
    </div>
  );
}
