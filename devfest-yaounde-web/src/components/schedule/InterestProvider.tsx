"use client";

import { Heart } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * "This interests me" (ADR 0086) for the schedule: one fetch of the signed-in
 * person's list, shared by every card and the full-screen reader through
 * context so a tap in one place shows everywhere at once.
 *
 * Mounted only where it is wanted (the /schedule page), so the home page does
 * not ask the server who is signed in.
 */
interface InterestContext {
  signedIn: boolean | null;
  has: (id: string) => boolean;
  toggle: (id: string) => Promise<boolean>;
}

const Ctx = createContext<InterestContext | null>(null);

export function InterestProvider({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let live = true;
    fetch("/api/interests", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { signedIn?: boolean; sessionIds?: string[] } | null) => {
        if (!live) return;
        setSignedIn(Boolean(body?.signedIn));
        setIds(new Set(body?.sessionIds ?? []));
      })
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, []);

  const toggle = useCallback(
    async (id: string) => {
      const next = !ids.has(id);
      // Optimistic: the tap answers instantly, a failure puts it back.
      setIds((cur) => {
        const copy = new Set(cur);
        if (next) copy.add(id);
        else copy.delete(id);
        return copy;
      });
      try {
        const response = await fetch("/api/interests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: id, interested: next }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { sessionIds: string[] };
        setIds(new Set(body.sessionIds));
        return true;
      } catch {
        setIds((cur) => {
          const copy = new Set(cur);
          if (next) copy.delete(id);
          else copy.add(id);
          return copy;
        });
        return false;
      }
    },
    [ids],
  );

  const value = useMemo<InterestContext>(
    () => ({ signedIn, has: (id) => ids.has(id), toggle }),
    [signedIn, ids, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const ICON =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border-2 border-black02 text-black02 transition-[background-color,transform] duration-200 ease-bouncy hover:-translate-y-0.5 motion-reduce:transform-none";

/**
 * The heart: an icon-only button, named for screen readers and as a tooltip
 * ("This interests me"). Renders nothing outside an `InterestProvider` and
 * until we know whether the visitor is signed in. Signed-out visitors get nothing at all. Place it where it can sit apart from
 * other buttons (it is not nested in the card's own toggle).
 */
export function InterestButton({
  sessionId,
  className = "",
}: {
  sessionId: string;
  className?: string;
}) {
  const ctx = useContext(Ctx);
  const t = useTranslations("home.schedule");
  const [failed, setFailed] = useState(false);
  if (!ctx || ctx.signedIn === null) return null;

  // Visitors who are not signed in never see it.
  if (!ctx.signedIn) return null;

  const on = ctx.has(sessionId);
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        aria-label={t("interest")}
        title={failed ? t("interestFailed") : t("interest")}
        onClick={async () => setFailed(!(await ctx.toggle(sessionId)))}
        className={`${ICON} ${on ? "bg-primary" : "bg-offwhite hover:bg-primary/60"} ${className}`}
      >
        <Heart size={20} weight={on ? "fill" : "bold"} aria-hidden />
      </button>
      <span role="status" className="sr-only">
        {failed ? t("interestFailed") : on ? t("interestOn") : ""}
      </span>
    </>
  );
}
