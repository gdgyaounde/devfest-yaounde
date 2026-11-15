"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normaliseBadgeCode } from "@/lib/tickets/check-in";

/**
 * The camera + QR loop behind every scanning station (ADR 0078, 0079).
 *
 *   - Decodes with the browser's own `BarcodeDetector` where it exists
 *     (Chrome on Android) and with `jsQR`, imported only then, where it does
 *     not (Safari on iPhone).
 *   - A detected badge PAUSES the loop before `onCode` runs, so one badge in
 *     front of the camera is one request. The station calls `resume(code)`
 *     when it is ready for the next person, and that badge is then ignored
 *     for a few seconds — so it is not reported a second time as "already".
 *   - A QR that is not a badge calls `onJunk` once, not on every frame.
 *   - Starts by itself when the camera is already allowed; stops when the
 *     page is hidden (a phone in a pocket) and restarts when it comes back.
 */

export type CameraState =
  "off" | "starting" | "live" | "denied" | "unavailable" | "failed";

/** The badge just handled is ignored this long after resuming. */
const SAME_CODE_COOLDOWN_MS = 8000;
/** Frame sampling interval while looking for a code. */
const SCAN_INTERVAL_MS = 180;

type Detect = (video: HTMLVideoElement) => Promise<string | null>;

/** The bit of the Shape Detection API used here; not in TS's lib.dom yet. */
type BarcodeDetectorCtor = {
  new (opts: { formats: string[] }): {
    detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
  };
  getSupportedFormats(): Promise<string[]>;
};

async function createDetector(): Promise<Detect> {
  const Native = (
    window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
  ).BarcodeDetector;
  if (Native) {
    try {
      const formats = await Native.getSupportedFormats();
      if (formats.includes("qr_code")) {
        const detector = new Native({ formats: ["qr_code"] });
        return async (video) =>
          (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // Present but broken (it happens on some desktop builds) — fall back.
    }
  }

  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!ctx || !w || !h) return null;
    // A badge fills most of the frame; 640px is plenty and keeps an older
    // phone from cooking itself decoding full-resolution frames.
    const scale = Math.min(1, 640 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return (
      jsQR(image.data, image.width, image.height, {
        inversionAttempts: "dontInvert",
      })?.data ?? null
    );
  };
}

export function buzz(pattern: number | number[]) {
  try {
    // Browsers refuse (and log) a vibration before the first tap.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      return;
    }
    navigator.vibrate?.(pattern);
  } catch {
    // Not every browser has it, and nothing depends on it.
  }
}

export interface QrScanner {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camera: CameraState;
  torch: { supported: boolean; on: boolean };
  start: () => Promise<void>;
  turnOff: () => void;
  toggleTorch: () => Promise<void>;
  /** Stop reacting to frames (a request is in flight, a result is shown). */
  pause: () => void;
  /** Look again; `handled` is ignored for a few seconds. */
  resume: (handled?: string | null) => void;
  /** Whether the camera is wanted (so "next" knows where focus belongs). */
  wantsCamera: () => boolean;
}

export function useQrScanner({
  onCode,
  onJunk,
}: {
  onCode: (code: string) => void;
  onJunk: () => void;
}): QrScanner {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectRef = useRef<Detect | null>(null);
  const loopRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const cooldownRef = useRef<{ code: string; until: number } | null>(null);
  const junkRef = useRef<{ raw: string; until: number } | null>(null);
  const wantRef = useRef(false);
  const tickRef = useRef<() => void>(() => undefined);
  const handlers = useRef({ onCode, onJunk });

  const [camera, setCamera] = useState<CameraState>("off");
  const [torch, setTorch] = useState({ supported: false, on: false });

  useEffect(() => {
    handlers.current = { onCode, onJunk };
  }, [onCode, onJunk]);

  const stop = useCallback(() => {
    if (loopRef.current) window.clearTimeout(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorch({ supported: false, on: false });
  }, []);

  const tick = useCallback(async () => {
    const video = videoRef.current;
    const detect = detectRef.current;
    if (video && detect && !pausedRef.current && video.readyState >= 2) {
      try {
        const raw = await detect(video);
        // Re-checked after the await: the camera may have been switched off,
        // or a typed code submitted, while this frame was decoding.
        if (raw && !pausedRef.current && streamRef.current) {
          const now = Date.now();
          const code = normaliseBadgeCode(raw);
          const cool = cooldownRef.current;
          if (code && !(cool && cool.code === code && now < cool.until)) {
            pausedRef.current = true;
            handlers.current.onCode(code);
          } else if (!code) {
            const junk = junkRef.current;
            if (!(junk && junk.raw === raw && now < junk.until)) {
              junkRef.current = { raw, until: now + 4000 };
              handlers.current.onJunk();
            }
          }
        }
      } catch {
        // A frame that failed to decode is just a frame; try the next one.
      }
    }
    if (streamRef.current) {
      loopRef.current = window.setTimeout(
        () => tickRef.current(),
        SCAN_INTERVAL_MS,
      );
    }
  }, []);

  useEffect(() => {
    tickRef.current = () => void tick();
  }, [tick]);

  const start = useCallback(async () => {
    wantRef.current = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      // Turned off (or unmounted) while the permission prompt was up.
      if (!wantRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      detectRef.current ??= await createDetector();

      const [track] = stream.getVideoTracks();
      const caps = (
        track?.getCapabilities as
          (() => MediaTrackCapabilities & { torch?: boolean }) | undefined
      )?.call(track);
      setTorch({ supported: Boolean(caps?.torch), on: false });
      setCamera("live");
      void tick();
    } catch (error) {
      const name = (error as { name?: string })?.name;
      setCamera(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "unavailable"
            : "failed",
      );
      wantRef.current = false;
    }
  }, [tick]);

  const turnOff = useCallback(() => {
    wantRef.current = false;
    stop();
    setCamera("off");
  }, [stop]);

  const toggleTorch = useCallback(async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({
        advanced: [{ torch: on } as MediaTrackConstraintSet],
      });
      setTorch({ supported: true, on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }, [torch.on]);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback((handled?: string | null) => {
    if (handled) {
      cooldownRef.current = {
        code: handled,
        until: Date.now() + SAME_CODE_COOLDOWN_MS,
      };
    }
    pausedRef.current = false;
  }, []);

  const wantsCamera = useCallback(() => wantRef.current, []);

  // Start by itself when the camera was already allowed. Browsers that
  // cannot answer the permission question (Firefox) get the button.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === "granted") void start();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [start]);

  // A locked phone should not keep the camera (and battery) on.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (streamRef.current) stop();
      } else if (wantRef.current && !streamRef.current) {
        void start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [start, stop]);

  useEffect(
    () => () => {
      wantRef.current = false;
      stop();
    },
    [stop],
  );

  // Stable between renders unless camera/torch state changes, so a station
  // can keep it in a ref without re-running effects every render.
  return useMemo(
    () => ({
      videoRef,
      camera,
      torch,
      start,
      turnOff,
      toggleTorch,
      pause,
      resume,
      wantsCamera,
    }),
    [camera, torch, start, turnOff, toggleTorch, pause, resume, wantsCamera],
  );
}
