"use client";

import {
  ArrowClockwise,
  Copy,
  DownloadSimple,
  ImageSquare,
  LockSimple,
  ShareNetwork,
  Sparkle,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import {
  ACCEPTED_TYPES,
  composeDp,
  DEFAULT_EFFECTS,
  DEFAULT_TRANSFORM,
  DP_SIZE,
  DP_SIZE_HIGH,
  DpImageError,
  dpFileName,
  loadPhoto,
  photoBoxUnits,
  SHAPE_GROW,
  type DpCorners,
  type DpEdge,
  type DpEffects,
  type DpLook,
  type DpRatio,
  type DpTransform,
} from "@/lib/dp/compose";
import { shapePath, type DpShape, type ShapeRecipe } from "@/lib/dp/shapes";
import {
  CUSTOM_BADGE_ID,
  DEFAULT_BADGE_ID,
  DEFAULT_FRAME_ID,
  DP_BADGES,
  DP_FRAMES,
  findFrame,
  type DpFrame,
} from "@/lib/dp/frames";
import { bouncyPop } from "@/lib/motion";
import { useBeforeInstant } from "@/lib/use-before-instant";
import { useSeenOnce } from "@/lib/use-seen-once";
import {
  SHAPE_STICKERS,
  stickerName,
  STICKER_MAX_SCALE,
  STICKER_MIN_SCALE,
  TECH_STICKERS,
  TEXT_STICKERS,
  type PlacedSticker,
} from "@/lib/dp/stickers";
import { stashComposedCard, takeDownCard } from "@/lib/dp/gallery";
import { planWallStash, type WallStash } from "@/lib/dp/wall-stash";
import { Modal } from "@/components/ui/Modal";
import {
  copyImage,
  copyCaption,
  downloadDp,
  shareCaption,
  shareDp,
} from "@/lib/dp/share";
import { Toast } from "@/components/ui/Toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { DpStage } from "./DpStage";
import { StickerChip } from "./StickerChip";
import { clampTransform, MAX_SCALE, MIN_SCALE } from "./pan";

/** Matches the slice in `drawPlate` — the input refuses what the card would cut. */
const MAX_NICKNAME = 28;

const GROUPS = ["info", "style", "effects", "stickers", "share"] as const;
type Group = (typeof GROUPS)[number];

const LOOKS: DpLook[] = [
  "none",
  "duotone",
  "halftone",
  "mono",
  "chromatic",
  "poster",
  "pixel",
  "mosaic",
];
const EDGES: DpEdge[] = ["clean", "torn", "brush"];
const TEXTURES = ["grain", "paper", "vignette", "warp", "lens"] as const;
const RATIOS: DpRatio[] = ["1:1", "3:4"];
const CORNERS: DpCorners[] = ["rounded", "square", "mixed"];
/** The most stickers one card can carry before it is just noise. */
const MAX_STICKERS = 12;

type ErrorCode = DpImageError["code"];
type Notice =
  | "shared"
  | "copied"
  | "unavailable"
  | "downloaded"
  | "failed"
  | "imageCopied"
  | "copyUnsupported"
  | "captionCopied";

/**
 * `/dp-generator` — the whole feature (PAGES.md §9; rebuilt in PHASE16).
 *
 * STANDALONE FOR THE PHOTO: no sign-in, no session. The composed card is
 * saved on download/share/copy (ADR 0034); the source photo never uploads.
 * A failed save does not block the action.
 *
 * NOT A WIZARD. Name, photo, style, effects, stickers and crop all change the
 * same picture, so hiding half of them behind "next" would make people walk
 * the flow again to fix one thing.
 *
 * ONE DOM, TWO SHAPES. On a desktop the five control groups stack in a column
 * beside a sticky preview. On a phone the same five become a toggleable sheet
 * pinned to the bottom, with a tab bar, and the preview always in view above.
 * The switch is pure CSS (`max-md:` / `md:`) rather than a media-query mount,
 * so nothing jumps at hydration and there is exactly one copy of every
 * control — no duplicate `useId`, no second tab stop, nothing to keep in sync.
 *
 * The sheet is deliberately NOT the shared `BottomSheet`: that one is modal —
 * scrim, focus trap, scroll lock — and every one of those would hide or
 * freeze the live preview this sheet exists to sit beside. `FilterLayout`
 * makes the same call for the same reason.
 */
/**
 * The collector perks' state (ADR 0077, 0080): frames and photo shapes,
 * fetched lazily, never awaited. "unlocked" also unlocks the typed badge.
 */
type CollectorState =
  | { status: "loading" | "locked" }
  | { status: "unlocked"; frames: DpFrame[]; shapes: DpShape[] };

/** The three ways a card leaves the page. */
type SaveAction = "download" | "share" | "copy";

/** Typed badges: short enough to sit on the plate's tag. */
const CUSTOM_BADGE_MAX = 22;

/** A typed badge, cleaned the way the plate will show it. */
function cleanBadgeText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, CUSTOM_BADGE_MAX);
}

export function DpGenerator({
  salesCloseAt = null,
}: {
  /** Where the locked collector tiles point: /tickets until this, the FAQ after. */
  salesCloseAt?: string | null;
}) {
  const t = useTranslations("pages.dpGenerator");
  const tError = useTranslations("errors.dp");
  const locale = useLocale();
  const lang = locale === "en" ? "en" : "fr";
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");

  const [nickname, setNickname] = useState("");
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [frameId, setFrameId] = useState(DEFAULT_FRAME_ID);
  const tc = useTranslations("pages.dpGenerator.collector");
  const salesOpen = useBeforeInstant(salesCloseAt, true);
  const [collector, setCollector] = useState<CollectorState>({
    status: "loading",
  });
  /*
   * COLLECTOR FRAMES (ADR 0077). Asked for once, in the background: the
   * generator works the whole time, signed in or not (ADR 0015/0034), and
   * only the two locked tiles wait on the answer. The definitions come from
   * the server and only to entitled holders — they are not in this bundle.
   */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dp/collector-frames", { cache: "no-store" })
      .then(async (res) => {
        const json = res.ok ? await res.json() : null;
        if (cancelled) return;
        setCollector(
          json?.entitled && Array.isArray(json.frames)
            ? {
                status: "unlocked",
                frames: json.frames as DpFrame[],
                shapes: Array.isArray(json.shapes)
                  ? (json.shapes as DpShape[])
                  : [],
              }
            : { status: "locked" },
        );
      })
      .catch(() => {
        if (!cancelled) setCollector({ status: "locked" });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const collectorFrames =
    collector.status === "unlocked" ? collector.frames : [];
  /* The unlock moment: the first time an entitled holder opens the style
     picker, the two frames pop in with an "Unlocked!" tag — once per
     browser (useSeenOnce), bouncy, and still under reduced motion. */
  const [unlockSeen, markUnlockSeen] = useSeenOnce(
    collector.status === "unlocked" ? "devfest:collector-unlocked" : null,
  );
  const [badgeId, setBadgeId] = useState(DEFAULT_BADGE_ID);
  /* Collector perks (ADR 0080): a typed badge and a photo shape. Both only
     apply while the server says this person is entitled. */
  const [customBadge, setCustomBadge] = useState("");
  const [shapeId, setShapeId] = useState<string | null>(null);
  const [ratio, setRatio] = useState<DpRatio>("1:1");
  const [corners, setCorners] = useState<DpCorners>("rounded");
  const [effects, setEffects] = useState<DpEffects>(DEFAULT_EFFECTS);
  const [transform, setTransform] = useState<DpTransform>(DEFAULT_TRANSFORM);
  const [stickers, setStickers] = useState<PlacedSticker[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [exportSize, setExportSize] = useState(DP_SIZE);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [wallToast, setWallToast] = useState(false);

  /*
   * NAME CHECK (ADR 0081). People — on phones especially, where the name
   * field sits in another tab — were exporting cards with an empty plate.
   * Download / Share / Copy now ask first, in a dialog that works from any
   * tab. "Continue without a name" is respected for the rest of that photo.
   */
  const [nameAsk, setNameAsk] = useState<SaveAction | null>(null);
  const [draftName, setDraftName] = useState("");
  const skipNameFor = useRef<number | null>(null);

  /* Which upload this is, so the wall can tell a new photo from an edit. */
  const [photoKey, setPhotoKey] = useState(0);
  /* The card this visit last put on the wall (ADR 0081). */
  const stashed = useRef<(WallStash & { id: string; token: string }) | null>(
    null,
  );

  useEffect(() => {
    if (!wallToast) return;
    const timer = window.setTimeout(() => setWallToast(false), 10000);
    return () => window.clearTimeout(timer);
  }, [wallToast]);
  const [dropping, setDropping] = useState(false);
  const [tab, setTab] = useState<Group>("info");
  const [sheetOpen, setSheetOpen] = useState(true);

  const fileInput = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const zoomId = useId();
  const groupId = useId();

  /* Bitmaps hold decoded pixels — a 12 MB JPEG is far larger once decoded, so
     the one being replaced is released rather than left to the collector. The
     cleanup closes the bitmap from ITS OWN render, which is what makes this
     correct on both replace and unmount. */
  useEffect(() => {
    if (!photo) return;
    return () => photo.close();
  }, [photo]);

  /* Changing the card's shape changes the photo box, so a crop that was legal
     in a square can hang off the edge of a tall card.
     DERIVED, not corrected in an effect: the clamp is a pure function of the
     photo, the crop and the ratio, so computing it during render keeps the
     invariant true for every path that can reach it — and an effect that
     setStates is what this codebase's lint rightly refuses. Memoised because
     a fresh object on every render would redraw the canvas on every render. */
  /* A shaped photo has a bigger box (ADR 0080); the pan limits follow it. */
  const grow =
    shapeId !== null && collector.status === "unlocked" ? SHAPE_GROW : 0;
  const boxUnits = useMemo(() => photoBoxUnits(ratio, grow), [ratio, grow]);
  const safeTransform = useMemo(
    () => (photo ? clampTransform(photo, transform, boxUnits) : transform),
    [photo, transform, boxUnits],
  );

  /* "Opens the picker" = the collector row actually comes into view: the
     style group is always visible on desktop and behind a tab on phones,
     so an observer is the one signal that means the same thing on both. */
  const collectorRowRef = useRef<HTMLDivElement>(null);
  const [collectorInView, setCollectorInView] = useState(false);
  useEffect(() => {
    const row = collectorRowRef.current;
    if (!row || collector.status !== "unlocked" || unlockSeen) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setCollectorInView(true);
      },
      { threshold: 0.6 },
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [collector.status, unlockSeen, tab]);
  const unlocking =
    collector.status === "unlocked" && !unlockSeen && collectorInView;
  useEffect(() => {
    if (!unlocking) return;
    const id = window.setTimeout(markUnlockSeen, 2400);
    return () => window.clearTimeout(id);
  }, [unlocking, markUnlockSeen]);

  const collectorShapes =
    collector.status === "unlocked" ? collector.shapes : [];
  const shape = collectorShapes.find((option) => option.id === shapeId) ?? null;
  const usingCustomBadge =
    collector.status === "unlocked" &&
    badgeId === CUSTOM_BADGE_ID &&
    customBadge.trim() !== "";
  const badgeText = usingCustomBadge ? customBadge : undefined;

  const frame =
    collectorFrames.find((f) => f.id === frameId) ??
    findFrame(frameId) ??
    DP_FRAMES[0];
  /* A collector id with no definition (signed out mid-session) falls back
     to the default frame rather than rendering nothing. */
  const effectiveFrameId = frame.id;
  const caption = shareCaption(lang);
  const selectedSticker = stickers.find((s) => s.key === selected) ?? null;

  /**
   * Bring the card back on screen — phones only.
   *
   * The page leads with a display-size title and a paragraph, which puts the
   * preview about 450px down. With the sheet pinned over the bottom of the
   * screen that left the card in the gap between them: invisible while you
   * edited it, which is the one thing this layout exists to prevent.
   */
  function revealPreview() {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    previewRef.current?.scrollIntoView({
      block: "start",
      behavior: calm ? "auto" : "smooth",
    });
  }

  async function acceptFile(file: File | undefined) {
    if (!file) return;
    setNotice(null);
    try {
      const bitmap = await loadPhoto(file);
      setPhoto(bitmap);
      setPhotoKey((n) => n + 1);
      /* A new photo means a new subject: keeping the previous crop would
         frame someone else's shoulders. */
      setTransform(DEFAULT_TRANSFORM);
      setError(null);
      revealPreview();
    } catch (err) {
      setError(err instanceof DpImageError ? err.code : "unreadable");
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    void acceptFile(e.target.files?.[0]);
    /* Cleared so picking the SAME file twice still fires a change event —
       otherwise "choose another", then changing your mind, does nothing. */
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropping(false);
    void acceptFile(e.dataTransfer.files?.[0]);
  }

  /* Where a new sticker lands.
     A formula spread them evenly on paper and piled them on top of each
     other in practice, because a word sticker is five times wider than a
     shape. So shapes go round the photo on a fixed ring, words stack down
     the middle where there is room for their width, and neither queue
     lands on the branding plate. */
  const SHAPE_SPOTS = [
    [0.24, 0.2],
    [0.76, 0.24],
    [0.22, 0.5],
    [0.78, 0.5],
    [0.5, 0.15],
    [0.32, 0.63],
    [0.68, 0.63],
    [0.5, 0.44],
  ];
  const WORD_SPOTS = [0.28, 0.56, 0.42, 0.7];

  function addSticker(stickerId: string) {
    if (stickers.length >= MAX_STICKERS) return;
    const isWord = TEXT_STICKERS.some((s) => s.id === stickerId);
    const sameKind = stickers.filter((s) =>
      isWord
        ? TEXT_STICKERS.some((t) => t.id === s.stickerId)
        : !TEXT_STICKERS.some((t) => t.id === s.stickerId),
    ).length;
    const [x, y] = isWord
      ? [0.5, WORD_SPOTS[sameKind % WORD_SPOTS.length]]
      : SHAPE_SPOTS[sameKind % SHAPE_SPOTS.length];

    setStickers((current) => [
      ...current,
      {
        key: `${stickerId}-${Date.now()}-${current.length}`,
        stickerId,
        x,
        y,
        scale: 1,
        rotation: (sameKind % 2 ? -1 : 1) * (0.05 + (sameKind % 3) * 0.04),
      },
    ]);
    setTab("stickers");
  }

  function patchSelected(patch: Partial<PlacedSticker>) {
    if (!selected) return;
    setStickers((current) =>
      current.map((s) => (s.key === selected ? { ...s, ...patch } : s)),
    );
  }

  async function render(name: string): Promise<Blob | null> {
    if (!photo) return null;
    try {
      return await composeDp({
        photo,
        frameId: effectiveFrameId,
        frame,
        nickname: name,
        transform: safeTransform,
        effects,
        badgeId,
        badgeText,
        shape: shape?.recipe ?? null,
        ratio,
        corners,
        stickers,
        locale: lang,
        size: exportSize,
      });
    } catch {
      setNotice("failed");
      return null;
    }
  }

  /** Everything drawn on the card — two equal keys are the same card. */
  function cardKey(name: string): string {
    return JSON.stringify({
      name: name.trim(),
      frame: effectiveFrameId,
      effects,
      badgeId,
      badgeText,
      shape: shape?.id ?? null,
      ratio,
      corners,
      stickers,
      transform: safeTransform,
      locale: lang,
    });
  }

  /** One card per photo per visit on the wall (ADR 0081). */
  async function stash(blob: Blob, name: string) {
    const next = { key: cardKey(name), photoKey };
    const plan = planWallStash(stashed.current, next);
    if (plan === "skip") return;
    const submission = await stashComposedCard({
      card: blob,
      nickname: name,
      locale: lang,
      theme: effectiveFrameId,
      shape: shape?.id,
      customBadge: usingCustomBadge,
    });
    if (!submission) return;
    const previous = stashed.current;
    stashed.current = {
      ...next,
      id: submission.id,
      token: submission.deletionToken,
    };
    // The edited version is up; the stale one comes down. Best effort — a
    // failure leaves both, which is what used to happen every time.
    if (plan === "replace" && previous) {
      void takeDownCard(previous.id, previous.token).catch(() => undefined);
    }
  }

  async function onDownload(name: string) {
    setBusy("download");
    setNotice(null);
    const blob = await render(name);
    if (blob) {
      await stash(blob, name);
      downloadDp(blob, dpFileName(name));
      setNotice("downloaded");
      setWallToast(true);
    }
    setBusy(null);
  }

  async function onShare(name: string) {
    setBusy("share");
    setNotice(null);
    const blob = await render(name);
    if (blob) {
      await stash(blob, name);
      setNotice(
        await shareDp({ blob, fileName: dpFileName(name), locale: lang }),
      );
    }
    setBusy(null);
  }

  /** The card itself on the clipboard, for pasting straight into a post. */
  async function onCopyImage(name: string) {
    setBusy("share");
    setNotice(null);
    const blob = await render(name);
    if (blob) {
      await stash(blob, name);
      setNotice(await copyImage(blob));
    }
    setBusy(null);
  }

  function runSave(action: SaveAction, name: string) {
    if (action === "download") void onDownload(name);
    else if (action === "share") void onShare(name);
    else void onCopyImage(name);
  }

  /** Ask for a name first, unless there is one or they already said no. */
  function save(action: SaveAction) {
    if (!nickname.trim() && skipNameFor.current !== photoKey) {
      setDraftName("");
      setNameAsk(action);
      return;
    }
    runSave(action, nickname);
  }

  async function onCopyCaption() {
    setNotice(null);
    const result = await copyCaption(lang);
    setNotice(result === "copied" ? "captionCopied" : result);
  }

  const stageLabel = nickname.trim()
    ? t("preview.label", {
        nickname: nickname.trim(),
        frame: frame.label[lang],
      })
    : t("preview.labelAnonymous", { frame: frame.label[lang] });

  /* Two namespaces: `errors.dp.*` is the shared vocabulary for what a share
     did (or could not do), `status.*` is this screen's own. The wall's
     outcomes are this screen's, since nothing else can produce them. */
  const OWN_NOTICES = ["imageCopied", "copyUnsupported", "captionCopied"];
  const noticeText = !notice
    ? ""
    : notice === "downloaded" ||
        notice === "failed" ||
        OWN_NOTICES.includes(notice)
      ? t(`status.${notice}`)
      : tError(notice);

  const panelId = (group: Group) => `${groupId}-${group}`;

  return (
    <div className="grid gap-12 max-md:pb-40 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:gap-14 lg:gap-16">
      {/* ================= Preview ================= */}
      <div
        ref={previewRef}
        className="order-1 scroll-mt-[calc(var(--chrome-h)-3.5rem)] md:order-2 md:sticky md:top-[calc(var(--chrome-h)+1rem)] md:self-start"
        onDragOver={(e) => {
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        {/* On a phone the card gives up some size while the sheet is open, so
            both stay on screen at once — the whole reason the sheet toggles. */}
        <div
          className={`mx-auto transition-[max-width] duration-300 ease-bouncy motion-reduce:transition-none ${
            sheetOpen ? "max-md:max-w-[13rem]" : "max-md:max-w-none"
          }`}
        >
          {photo ? (
            <DpStage
              photo={photo}
              frameId={effectiveFrameId}
              frame={frame}
              nickname={nickname}
              transform={safeTransform}
              onTransformChange={setTransform}
              effects={effects}
              badgeId={badgeId}
              badgeText={badgeText}
              shape={shape?.recipe ?? null}
              ratio={ratio}
              corners={corners}
              stickers={stickers}
              onStickersChange={setStickers}
              selected={selected}
              onSelect={setSelected}
              locale={lang}
              label={stageLabel}
              hintId={hintId}
              calm={calm}
            />
          ) : (
            /* The empty state is the drop target and the picker in one, and it
               shows the chosen style's colours — so the look you picked is
               visible before you have a photo to put in it. */
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              style={{
                background: frame.background,
                aspectRatio: ratio === "3:4" ? "3 / 4" : "1 / 1",
              }}
              className={`flex w-full flex-col items-center justify-center gap-3 border-2 border-dashed p-6 text-center transition-colors ${
                corners === "square" ? "" : "rounded-lg"
              } ${dropping ? "border-black02 bg-primary" : "border-black02/50"}`}
            >
              <ImageSquare
                size={40}
                weight="bold"
                aria-hidden
                style={{ color: frame.accent }}
              />
              <span
                className="font-sans text-body-l font-bold"
                style={{ color: frame.foreground }}
              >
                {dropping ? t("photo.dropActive") : t("preview.empty")}
              </span>
              <span
                className="text-body-m opacity-75 max-md:hidden"
                style={{ color: frame.foreground }}
              >
                {t("photo.drop")}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ================= Controls ================= */}
      <div className="order-2 md:order-1 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:rounded-t-lg max-md:border-x-2 max-md:border-t-4 max-md:border-black02 max-md:bg-offwhite max-md:px-5 max-md:pb-4 max-md:pt-3">
        {/* ---- Sheet header: phones only ---- */}
        <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
          <span aria-hidden className="h-1.5 w-12 rounded-pill bg-black02/25" />
          <button
            type="button"
            onClick={() => {
              const next = !sheetOpen;
              setSheetOpen(next);
              if (next) revealPreview();
            }}
            aria-expanded={sheetOpen}
            aria-controls={`${groupId}-sheet`}
            className="rounded-pill border-2 border-black02 bg-primary px-4 py-1.5 font-sans text-body-m font-bold text-black02"
          >
            {sheetOpen ? t("sheet.hide") : t("sheet.show")}
          </button>
        </div>

        {/* The auto-height animation this codebase already uses: 1fr -> 0fr on
            a grid row, so the sheet collapses to exactly its content height
            without anyone measuring anything. */}
        <div
          id={`${groupId}-sheet`}
          className={`max-md:grid max-md:transition-[grid-template-rows] max-md:duration-300 max-md:ease-bouncy motion-reduce:transition-none ${
            sheetOpen ? "max-md:grid-rows-[1fr]" : "max-md:grid-rows-[0fr]"
          }`}
        >
          <div className="max-md:min-h-0 max-md:overflow-hidden">
            <div
              /* The cap is derived from the tokens the card is sized by, not
                 tuned by eye, so the card cannot end up behind the sheet. */
              className="max-md:max-h-[calc(100svh-var(--chrome-h)-13rem-4rem)] max-md:overflow-y-auto max-md:pb-2"
            >
              {/* ---- Tab bar: phones only ---- */}
              <div className="mb-5 flex gap-2 overflow-x-auto md:hidden">
                {GROUPS.map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => {
                      setTab(group);
                      setSheetOpen(true);
                      revealPreview();
                    }}
                    aria-pressed={tab === group}
                    aria-controls={panelId(group)}
                    className={`shrink-0 rounded-pill border-2 border-black02 px-3.5 py-2 font-sans text-body-m font-bold transition-colors ${
                      tab === group
                        ? "bg-black02 text-offwhite"
                        : "bg-offwhite text-black02"
                    }`}
                  >
                    {t(`tabs.${group}`)}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-10 max-md:gap-0">
                {/* ============ 01 — you ============ */}
                <Group
                  id={panelId("info")}
                  step="01"
                  title={t("groups.info")}
                  active={tab === "info"}
                >
                  <label className="flex flex-col gap-1.5">
                    <span className="sr-only">{t("nickname.label")}</span>
                    <input
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      maxLength={MAX_NICKNAME}
                      placeholder={t("nickname.placeholder")}
                      autoComplete="off"
                      className="w-full max-w-sm rounded-lg border-2 border-black02 bg-offwhite px-4 py-2.5 font-sans text-body-l font-bold text-black02"
                    />
                    <span className="flex max-w-sm items-center justify-between gap-4 text-caption text-black02/65">
                      {t("nickname.hint")}
                      <span className="shrink-0 font-mono tabular-nums">
                        {nickname.length}/{MAX_NICKNAME}
                      </span>
                    </span>
                  </label>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transform-none"
                    >
                      <ImageSquare size={18} weight="bold" aria-hidden />
                      {photo ? t("photo.replace") : t("photo.cta")}
                    </button>
                    {photo && (
                      <button
                        type="button"
                        onClick={() => {
                          setPhoto(null);
                          setTransform(DEFAULT_TRANSFORM);
                          setNotice(null);
                        }}
                        className="rounded-pill border-2 border-black02 px-5 py-3 font-sans text-body-m font-bold text-black02 hover:bg-halftone"
                      >
                        {t("photo.remove")}
                      </button>
                    )}
                    <input
                      ref={fileInput}
                      type="file"
                      accept={ACCEPTED_TYPES.join(",")}
                      onChange={onPick}
                      className="sr-only"
                      aria-label={t("photo.cta")}
                    />
                  </div>
                  <p className="mt-2 text-caption text-black02/65">
                    {t("photo.hint")}
                  </p>

                  {error && (
                    <p
                      role="alert"
                      className="mt-3 flex items-start gap-2 rounded-lg border-2 border-danger bg-danger-pastel p-4 text-body-m font-bold text-black02"
                    >
                      <Warning
                        size={20}
                        weight="bold"
                        aria-hidden
                        className="mt-0.5 shrink-0 text-danger-ink"
                      />
                      {tError(error)}
                    </p>
                  )}

                  <Legend className="mt-6">{t("ratio.legend")}</Legend>
                  <div className="flex flex-wrap gap-2.5">
                    {RATIOS.map((option) => (
                      <Choice
                        key={option}
                        name="dp-ratio"
                        value={option}
                        checked={ratio === option}
                        onChange={() => setRatio(option)}
                        label={t(
                          `ratio.${option === "1:1" ? "square" : "portrait"}`,
                        )}
                      />
                    ))}
                  </div>

                  <Legend className="mt-6">{t("corners.legend")}</Legend>
                  <div className="flex flex-wrap gap-2.5">
                    {CORNERS.map((option) => (
                      <Choice
                        key={option}
                        name="dp-corners"
                        value={option}
                        checked={corners === option}
                        onChange={() => setCorners(option)}
                        label={t(`corners.${option}`)}
                      />
                    ))}
                  </div>

                  {/* Photo shapes (ADR 0080): the Gemini / Material masks,
                      for paid passes and admins. A locked teaser for
                      everyone else, like the collector frames. */}
                  <Legend className="mt-6">{tc("shapesLegend")}</Legend>
                  <div className="flex flex-wrap gap-2.5">
                    {collector.status === "unlocked" ? (
                      <>
                        <Choice
                          name="dp-shape"
                          value="standard"
                          checked={shape === null}
                          onChange={() => setShapeId(null)}
                          label={tc("shapeStandard")}
                        />
                        {collectorShapes.map((option) => (
                          <Choice
                            key={option.id}
                            name="dp-shape"
                            value={option.id}
                            checked={option.id === shape?.id}
                            onChange={() => setShapeId(option.id)}
                            label={option.label[lang]}
                            swatch={<ShapeSwatch recipe={option.recipe} />}
                          />
                        ))}
                      </>
                    ) : (
                      <LockedTile
                        href={
                          salesOpen ? "/tickets" : "/faqs#faq-section-tickets"
                        }
                        label={tc("shapesLocked")}
                        ariaLabel={tc("shapesLockedLabel")}
                        busy={collector.status === "loading"}
                      />
                    )}
                  </div>

                  <Legend className="mt-6">{t("adjust.zoom")}</Legend>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <label htmlFor={zoomId} className="sr-only">
                      {t("adjust.zoom")}
                    </label>
                    <input
                      id={zoomId}
                      type="range"
                      className="dp-range w-full max-w-xs"
                      min={MIN_SCALE}
                      max={MAX_SCALE}
                      step={0.01}
                      value={safeTransform.scale}
                      disabled={!photo}
                      onChange={(e) =>
                        setTransform((current) =>
                          photo
                            ? clampTransform(
                                photo,
                                { ...current, scale: Number(e.target.value) },
                                boxUnits,
                              )
                            : current,
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setTransform(DEFAULT_TRANSFORM)}
                      disabled={!photo}
                      className="inline-flex items-center gap-2 rounded-pill border-2 border-black02 px-4 py-2 font-sans text-body-m font-bold text-black02 hover:bg-halftone disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowClockwise size={16} weight="bold" aria-hidden />
                      {t("adjust.reset")}
                    </button>
                  </div>
                  <p
                    id={hintId}
                    className="mt-3 max-w-md text-caption text-black02/70"
                  >
                    {photo ? t("adjust.hint") : t("adjust.waiting")}
                  </p>
                </Group>

                {/* ============ 02 — style ============ */}
                <Group
                  id={panelId("style")}
                  step="02"
                  title={t("groups.style")}
                  active={tab === "style"}
                >
                  {/* Collector frames FIRST (ADR 0077): the two real ones
                      for paid holders, two locked teasers for everyone
                      else — never hidden, because the point is that they
                      exist. Nothing here blocks the rest of the picker. */}
                  <Legend>{tc("legend")}</Legend>
                  <div
                    ref={collectorRowRef}
                    className="mb-6 flex flex-wrap gap-2.5"
                  >
                    {collector.status === "unlocked"
                      ? collector.frames.map((option) => (
                          <span
                            key={option.id}
                            className={unlocking ? bouncyPop : ""}
                          >
                            <Choice
                              name="dp-frame"
                              value={option.id}
                              checked={option.id === frameId}
                              onChange={() => setFrameId(option.id)}
                              label={option.label[lang]}
                              tag={
                                <span className="ml-1 inline-flex items-center gap-1 rounded-pill border-2 border-black02 bg-black02 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide text-primary">
                                  <Sparkle
                                    size={11}
                                    weight="fill"
                                    aria-hidden
                                  />
                                  {unlocking ? tc("unlocked") : tc("badge")}
                                </span>
                              }
                              swatch={
                                <span
                                  aria-hidden
                                  className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-black02"
                                  style={{ background: option.background }}
                                >
                                  <span
                                    className="h-3 w-3 rounded-sm border-2"
                                    style={{ borderColor: option.accent }}
                                  />
                                </span>
                              }
                            />
                          </span>
                        ))
                      : [0, 1, 2].map((i) => (
                          <LockedTile
                            key={i}
                            href={
                              salesOpen
                                ? "/tickets"
                                : "/faqs#faq-section-tickets"
                            }
                            label={tc("locked")}
                            ariaLabel={tc("lockedLabel")}
                            busy={collector.status === "loading"}
                          />
                        ))}
                  </div>

                  <Legend>{t("frames.legend")}</Legend>
                  <div className="flex flex-wrap gap-2.5">
                    {DP_FRAMES.map((option) => (
                      <Choice
                        key={option.id}
                        name="dp-frame"
                        value={option.id}
                        checked={option.id === frameId}
                        onChange={() => setFrameId(option.id)}
                        label={option.label[lang]}
                        swatch={
                          <span
                            aria-hidden
                            className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-black02"
                            style={{ background: option.background }}
                          >
                            <span
                              className="h-3 w-3 rounded-sm border-2"
                              style={{ borderColor: option.accent }}
                            />
                          </span>
                        }
                      />
                    ))}
                  </div>

                  <Legend className="mt-6">{t("badges.legend")}</Legend>
                  <div className="flex flex-wrap gap-2.5">
                    {DP_BADGES.map((option) => (
                      <Choice
                        key={option.id}
                        name="dp-badge"
                        value={option.id}
                        checked={option.id === badgeId}
                        onChange={() => setBadgeId(option.id)}
                        label={option.label[lang]}
                      />
                    ))}
                    {/* A typed badge (ADR 0080) — paid passes and admins. */}
                    {collector.status === "unlocked" && (
                      <Choice
                        name="dp-badge"
                        value={CUSTOM_BADGE_ID}
                        checked={badgeId === CUSTOM_BADGE_ID}
                        onChange={() => setBadgeId(CUSTOM_BADGE_ID)}
                        label={tc("customBadge")}
                        tag={
                          <span className="ml-1 inline-flex items-center gap-1 rounded-pill border-2 border-black02 bg-black02 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide text-primary">
                            <Sparkle size={11} weight="fill" aria-hidden />
                            {tc("badge")}
                          </span>
                        }
                      />
                    )}
                  </div>
                  {collector.status === "unlocked" &&
                    badgeId === CUSTOM_BADGE_ID && (
                      <div className="mt-3 max-w-sm">
                        <label
                          htmlFor="dp-custom-badge"
                          className="font-sans text-body-m font-bold text-black02"
                        >
                          {tc("customBadgeLabel")}
                        </label>
                        <input
                          id="dp-custom-badge"
                          value={customBadge}
                          onChange={(e) =>
                            setCustomBadge(cleanBadgeText(e.target.value))
                          }
                          maxLength={CUSTOM_BADGE_MAX}
                          autoComplete="off"
                          placeholder={tc("customBadgePlaceholder")}
                          aria-describedby="dp-custom-badge-hint"
                          className="mt-2 w-full rounded-md border-2 border-black02 bg-offwhite px-3 py-2.5 font-mono text-body-m uppercase text-black02 placeholder:normal-case placeholder:text-black02/45"
                        />
                        <p
                          id="dp-custom-badge-hint"
                          className="mt-1 text-caption text-black02/70"
                        >
                          {tc("customBadgeHint", {
                            left: CUSTOM_BADGE_MAX - customBadge.length,
                          })}
                        </p>
                      </div>
                    )}
                </Group>

                {/* ============ 03 — effects ============ */}
                <Group
                  id={panelId("effects")}
                  step="03"
                  title={t("groups.effects")}
                  active={tab === "effects"}
                >
                  <Legend>{t("looks.legend")}</Legend>
                  <div className="flex flex-wrap gap-2.5">
                    {LOOKS.map((option) => (
                      <Choice
                        key={option}
                        name="dp-look"
                        value={option}
                        checked={effects.look === option}
                        onChange={() =>
                          setEffects((e) => ({ ...e, look: option }))
                        }
                        label={t(`looks.${option}`)}
                      />
                    ))}
                  </div>

                  <Legend className="mt-6">{t("edges.legend")}</Legend>
                  {shape && (
                    <p className="-mt-1 mb-2 text-caption text-black02/70">
                      {tc("edgesShapeNote")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2.5">
                    {EDGES.map((option) => (
                      <Choice
                        key={option}
                        name="dp-edge"
                        value={option}
                        checked={effects.edge === option}
                        onChange={() =>
                          setEffects((e) => ({ ...e, edge: option }))
                        }
                        label={t(`edges.${option}`)}
                      />
                    ))}
                  </div>

                  <Legend className="mt-6">{t("textures.legend")}</Legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-3">
                    {TEXTURES.map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2.5 text-body-m font-bold text-black02"
                      >
                        <input
                          type="checkbox"
                          checked={effects[key]}
                          onChange={(e) =>
                            setEffects((v) => ({
                              ...v,
                              [key]: e.target.checked,
                            }))
                          }
                          className="h-5 w-5 rounded-sm border-2 border-black02 accent-[var(--color-primary)]"
                        />
                        {t(`textures.${key}`)}
                      </label>
                    ))}
                  </div>
                </Group>

                {/* ============ 04 — stickers ============ */}
                <Group
                  id={panelId("stickers")}
                  step="04"
                  title={t("groups.stickers")}
                  active={tab === "stickers"}
                >
                  {/* One row. The tech shapes had a heading of their own,
                      which made a split where there is no real difference —
                      they are shapes, they behave like shapes, and a second
                      legend just cost a line of space. */}
                  <Legend>{t("stickers.shapes")}</Legend>
                  <div className="flex flex-wrap gap-2.5">
                    {[...SHAPE_STICKERS, ...TECH_STICKERS].map((s) => (
                      <StickerChip
                        key={s.id}
                        stickerId={s.id}
                        label={s.label[lang]}
                        locale={lang}
                        onAdd={() => addSticker(s.id)}
                      />
                    ))}
                  </div>

                  <Legend className="mt-6">{t("stickers.words")}</Legend>
                  <div className="flex flex-wrap gap-2.5">
                    {TEXT_STICKERS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addSticker(s.id)}
                        className="rounded-pill border-2 border-black02 bg-offwhite px-4 py-2 font-sans text-body-m font-bold text-black02 transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 hover:bg-pastel active:translate-y-0.5 motion-reduce:transform-none"
                      >
                        {s.label[lang]}
                      </button>
                    ))}
                  </div>

                  <p className="mt-3 max-w-md text-caption text-black02/70">
                    {stickers.length >= MAX_STICKERS
                      ? t("stickers.full")
                      : t("stickers.hint")}
                  </p>

                  {selectedSticker ? (
                    <div className="mt-5 rounded-lg border-2 border-black02 bg-pastel p-4">
                      {/* Naming it is the only feedback that says which of
                          twelve the sliders are about to move. */}
                      <p className="font-sans text-body-m font-bold text-black02">
                        {t("stickers.selected")}{" "}
                        <span className="rounded-pill border-2 border-black02 bg-offwhite px-2.5 py-0.5 font-mono text-mono-tag uppercase">
                          {stickerName(selectedSticker.stickerId, lang)}
                        </span>
                      </p>
                      <label className="mt-3 flex items-center gap-3">
                        <span className="w-20 shrink-0 font-mono text-mono-tag font-bold uppercase text-black02">
                          {t("stickers.size")}
                        </span>
                        <input
                          type="range"
                          className="dp-range w-full max-w-[12rem]"
                          min={STICKER_MIN_SCALE}
                          max={STICKER_MAX_SCALE}
                          step={0.01}
                          value={selectedSticker.scale}
                          onChange={(e) =>
                            patchSelected({ scale: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="mt-2 flex items-center gap-3">
                        <span className="w-20 shrink-0 font-mono text-mono-tag font-bold uppercase text-black02">
                          {t("stickers.turn")}
                        </span>
                        <input
                          type="range"
                          className="dp-range w-full max-w-[12rem]"
                          min={-Math.PI}
                          max={Math.PI}
                          step={0.01}
                          value={selectedSticker.rotation}
                          onChange={(e) =>
                            patchSelected({ rotation: Number(e.target.value) })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setStickers((c) =>
                            c.filter((s) => s.key !== selected),
                          );
                          setSelected(null);
                        }}
                        className="mt-3 inline-flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite px-4 py-2 font-sans text-body-m font-bold text-black02 hover:bg-danger-pastel hover:text-danger-ink"
                      >
                        <Trash size={16} weight="bold" aria-hidden />
                        {t("stickers.remove")}
                      </button>
                    </div>
                  ) : (
                    stickers.length > 0 && (
                      <p className="mt-4 rounded-lg border-2 border-dashed border-black02/40 p-4 text-caption text-black02/70">
                        {t("stickers.pick")}
                      </p>
                    )
                  )}
                </Group>

                {/* ============ 05 — save ============ */}
                <Group
                  id={panelId("share")}
                  step="05"
                  title={t("groups.share")}
                  active={tab === "share"}
                >
                  <Legend>{t("export.legend")}</Legend>
                  <div className="flex flex-wrap gap-2.5">
                    {[DP_SIZE, DP_SIZE_HIGH].map((size) => (
                      <Choice
                        key={size}
                        name="dp-size"
                        value={String(size)}
                        checked={exportSize === size}
                        onChange={() => setExportSize(size)}
                        label={t(
                          size === DP_SIZE ? "export.standard" : "export.high",
                          { px: size },
                        )}
                      />
                    ))}
                  </div>

                  {/* Informed, and in front of the buttons — not a tick
                      afterwards. ADR 0034: download/share/copy is the save. */}
                  <div className="mt-5 max-w-md rounded-lg border-2 border-black02 bg-pastel px-4 py-3">
                    <p className="text-body-m font-bold text-black02">
                      {t("consent.notice")}
                    </p>
                    <p className="mt-2 text-caption text-black02/80">
                      <Link
                        href="/wall/terms"
                        className="underline decoration-2 underline-offset-2 hover:text-black02"
                      >
                        {t("consent.termsLink")}
                      </Link>
                    </p>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 sm:max-w-sm">
                    <button
                      type="button"
                      onClick={() => save("download")}
                      disabled={!photo || busy !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-pill border-2 border-black02 bg-primary px-7 py-3.5 font-sans text-body-l font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 motion-reduce:transform-none"
                    >
                      <DownloadSimple size={20} weight="bold" aria-hidden />
                      {busy === "download"
                        ? t("actions.downloading")
                        : t("actions.download")}
                    </button>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => save("share")}
                        disabled={!photo || busy !== null}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-pill border-2 border-black02 px-7 py-3 font-sans text-body-m font-bold text-black02 hover:bg-halftone disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ShareNetwork size={18} weight="bold" aria-hidden />
                        {busy === "share"
                          ? t("actions.sharing")
                          : t("actions.share")}
                      </button>
                      {/* The CARD on the clipboard, ready to paste straight
                          into a post or a chat. Icon only: it sits beside a
                          labelled button doing the neighbouring job, and the
                          two together read as one pair of actions. */}
                      <button
                        type="button"
                        onClick={() => save("copy")}
                        disabled={!photo || busy !== null}
                        aria-label={t("actions.copyImage")}
                        title={t("actions.copyImage")}
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-pill border-2 border-black02 text-black02 hover:bg-halftone disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Copy size={18} weight="bold" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <p
                    aria-live="polite"
                    className="mt-3 min-h-[1.5rem] text-body-m font-bold text-black02"
                  >
                    {noticeText}
                  </p>

                  <div className="mt-5 rounded-lg border-2 border-black02 bg-offwhite p-5">
                    <p className="font-sans text-body-m font-bold text-black02">
                      {t("caption.title")}
                    </p>
                    <p className="mt-2 whitespace-pre-line rounded-md bg-pastel p-3 font-mono text-caption text-black02">
                      {caption}
                    </p>
                    <p className="mt-2 text-caption text-black02/70">
                      {t("caption.hint")}
                    </p>
                    <button
                      type="button"
                      onClick={() => void onCopyCaption()}
                      className="mt-3 inline-flex items-center gap-2 rounded-pill border-2 border-black02 px-4 py-2 font-sans text-body-m font-bold text-black02 hover:bg-primary"
                    >
                      <Copy size={16} weight="bold" aria-hidden />
                      {t("actions.copyCaption")}
                    </button>
                  </div>
                </Group>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Modal
        open={nameAsk !== null}
        onClose={() => setNameAsk(null)}
        labelledBy="dp-name-check-title"
        closeLabel={t("toast.dismiss")}
      >
        <form
          className="flex flex-col gap-4 p-2 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const name = draftName.trim().slice(0, MAX_NICKNAME);
            if (!name || !nameAsk) return;
            setNickname(name);
            const action = nameAsk;
            setNameAsk(null);
            runSave(action, name);
          }}
        >
          <h2
            id="dp-name-check-title"
            className="font-sans text-heading-l font-bold leading-tight text-black02"
          >
            {t("nameCheck.title")}
          </h2>
          <p className="text-body-m text-black02/80">{t("nameCheck.body")}</p>
          <label className="flex flex-col gap-2">
            <span className="font-sans text-body-m font-bold text-black02">
              {t("nickname.label")}
            </span>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={MAX_NICKNAME}
              data-autofocus
              autoComplete="nickname"
              enterKeyHint="done"
              placeholder={t("nickname.placeholder")}
              className="w-full rounded-pill border-2 border-black02 bg-offwhite px-5 py-3 text-body-m text-black02 placeholder:text-black02/45"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!draftName.trim()}
              className="rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none motion-reduce:transform-none"
            >
              {t("nameCheck.add")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!nameAsk) return;
                skipNameFor.current = photoKey;
                const action = nameAsk;
                setNameAsk(null);
                runSave(action, "");
              }}
              className="rounded-pill px-4 py-3 font-sans text-body-m font-bold text-black02 underline decoration-2 underline-offset-4"
            >
              {t("nameCheck.skip")}
            </button>
          </div>
        </form>
      </Modal>

      {wallToast && (
        <Toast
          onDismiss={() => setWallToast(false)}
          dismissLabel={t("toast.dismiss")}
        >
          {t.rich("toast.wall", {
            wall: (chunks) => (
              <Link
                href="/wall"
                className="underline decoration-2 underline-offset-2"
              >
                {chunks}
              </Link>
            ),
          })}
        </Toast>
      )}
    </div>
  );
}

/**
 * One control group.
 *
 * On a desktop every group is on screen at once and `active` means nothing.
 * On a phone only the selected tab's group is displayed — done with
 * `max-md:hidden` rather than by unmounting, so the state of a control you
 * tabbed away from is still there when you come back, and there is still only
 * one of each in the DOM.
 */
function Group({
  id,
  step,
  title,
  active,
  children,
}: {
  id: string;
  step: string;
  title: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={active ? "" : "max-md:hidden"}
    >
      <h2 className="mb-3 hidden items-baseline gap-3 md:flex">
        <span className="font-mono text-mono-tag font-bold text-black02/65">
          {step}
        </span>
        <span className="font-sans text-heading-m font-bold text-black02">
          {title}
        </span>
      </h2>
      {children}
    </section>
  );
}

function Legend({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`mb-2.5 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65 ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * A radio drawn as a chip.
 *
 * A real `<input type="radio">` under an `sr-only` class, so arrow-key
 * navigation within the group comes from the browser rather than from a
 * hand-rolled roving tabindex. Selection is carried by weight, a fill AND a
 * shadow — never by colour alone (DESIGN.md §2.6).
 */
function Choice({
  name,
  value,
  checked,
  onChange,
  label,
  swatch,
  tag,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  swatch?: ReactNode;
  /** A small marker after the label — the "Collector" tag (ADR 0077). */
  tag?: ReactNode;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={`flex items-center gap-2 rounded-pill border-2 border-black02 bg-offwhite font-sans text-body-m text-black02 peer-checked:bg-primary peer-checked:font-bold peer-checked:shadow-[0_4px_0_0_var(--color-black02)] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-[var(--color-primary)] ${
          swatch ? "py-1.5 pl-1.5 pr-4" : "px-4 py-2"
        }`}
      >
        {swatch}
        {label}
        {tag}
      </span>
    </label>
  );
}

/** A locked collector teaser: points at tickets, never hidden (ADR 0077). */
function LockedTile({
  href,
  label,
  ariaLabel,
  busy,
}: {
  href: string;
  label: string;
  ariaLabel: string;
  busy: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-busy={busy}
      className="flex items-center gap-2 rounded-pill border-2 border-dashed border-black02/50 bg-offwhite/60 py-1.5 pl-1.5 pr-4 font-sans text-body-m text-black02/75 transition-colors hover:border-black02 hover:bg-pastel"
    >
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-black02 bg-black02 text-primary"
      >
        <LockSimple size={14} weight="bold" />
      </span>
      {label}
    </Link>
  );
}

/** A photo shape's outline, drawn small for its picker chip (ADR 0080). */
function ShapeSwatch({ recipe }: { recipe: ShapeRecipe }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = 56;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    const path = shapePath(recipe, {
      cx: size / 2,
      cy: size / 2,
      rx: size / 2 - 4,
      ry: size / 2 - 4,
    });
    ctx.fillStyle = "#FFD427";
    ctx.fill(path);
    ctx.strokeStyle = "#1E1E1E";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.stroke(path);
  }, [recipe]);
  return <canvas ref={ref} aria-hidden className="h-7 w-7 shrink-0" />;
}
