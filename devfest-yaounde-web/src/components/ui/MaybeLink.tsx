import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { isPlaceholderUrl } from "@/lib/site-config";

/**
 * A link, or the same words without one.
 *
 * For labels people expect to see named even before the destination exists —
 * "Privacy Policy", "Participation Terms". Rendering an `<a href="#">` there
 * gives a crawler a link that goes nowhere and gives a visitor a click that
 * does nothing; rendering the text alone is honest, and the moment a real URL
 * is saved it becomes a link with no other edit.
 *
 * For icon-only links there is nothing to say without the destination, so
 * those are filtered out at their source instead of coming through here.
 */
export function MaybeLink({
  href,
  className = "",
  placeholderClassName = "",
  external = false,
  children,
}: {
  href: string | null | undefined;
  className?: string;
  /** Extra classes when it is only text — usually a muted colour. */
  placeholderClassName?: string;
  /**
   * Opens in a new tab. For documents that are somebody else's — the legal
   * pages are Google's and GDG's — where taking someone off the site they
   * were reading is a worse trade than an extra tab.
   */
  external?: boolean;
  children: ReactNode;
}) {
  if (isPlaceholderUrl(href)) {
    return (
      <span className={`${className} ${placeholderClassName}`}>{children}</span>
    );
  }
  /*
    An on-site path ("/terms" — the participation terms since ADR 0074) goes
    through the locale-aware Link, so an English reader lands on /en/terms
    rather than being bounced to the default locale, and it never opens a
    new tab: `external` only ever applied to somebody else's documents.
  */
  if (href!.startsWith("/") && !href!.startsWith("//")) {
    return (
      <Link href={href!} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href!}
      className={className}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : undefined)}
    >
      {children}
    </a>
  );
}
