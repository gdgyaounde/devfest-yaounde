"use client";

import { ArrowClockwise, Plus, Warning, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";

/**
 * X/Twitter-style staged multi-image upload.
 *
 * Every picked file uploads IMMEDIATELY and independently — there is no
 * "attach on save" step. The parent form just holds the resulting URLs in
 * `images`; by the time Save is pressed, every URL it sends already exists
 * in storage. This is what makes the picker safe to use for a brand-new
 * record that has no id to attach a photo to yet (a new swag item, a product
 * being drafted): `uploadPath` only needs to be a stable folder key the
 * caller generates up front (e.g. a client-side uuid), not a saved row id.
 *
 * One XHR per file, not `fetch`, specifically for `upload.onprogress` — the
 * per-file progress bar this is asked to show has no equivalent with fetch.
 * A failure is scoped to its own file: the others keep uploading, and a
 * failed one gets a retry button rather than losing the whole batch.
 */

interface StagedUpload {
  localId: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "uploading" | "error";
  error?: string;
  xhr?: XMLHttpRequest;
}

export function MultiImageUpload({
  images,
  onChange,
  uploadPath,
  max = 6,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  /** Stable folder key for this record's uploads, e.g. "tickets/sonnet/swag/abc123". */
  uploadPath: string;
  max?: number;
}) {
  const [staged, setStaged] = useState<StagedUpload[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const slotsLeft = max - images.length - staged.length;

  function upload(file: File) {
    const localId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    const entry: StagedUpload = {
      localId,
      file,
      previewUrl,
      progress: 0,
      status: "uploading",
    };
    setStaged((prev) => [...prev, entry]);
    send(entry);
  }

  function send(entry: StagedUpload) {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/uploads/image");
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const progress = Math.round((e.loaded / e.total) * 100);
      setStaged((prev) =>
        prev.map((s) => (s.localId === entry.localId ? { ...s, progress } : s)),
      );
    };
    xhr.onload = () => {
      if (xhr.status !== 200) {
        fail(entry.localId, "Upload failed. Try again.");
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as { url?: string };
        if (!body.url) throw new Error("no url");
        setStaged((prev) => prev.filter((s) => s.localId !== entry.localId));
        URL.revokeObjectURL(entry.previewUrl);
        onChange([...images, body.url]);
      } catch {
        fail(entry.localId, "Upload failed. Try again.");
      }
    };
    xhr.onerror = () => fail(entry.localId, "Could not reach the server.");
    xhr.onabort = () => {
      setStaged((prev) => prev.filter((s) => s.localId !== entry.localId));
      URL.revokeObjectURL(entry.previewUrl);
    };

    const body = new FormData();
    body.set("path", uploadPath);
    body.set("file", entry.file);
    xhr.send(body);

    setStaged((prev) =>
      prev.map((s) => (s.localId === entry.localId ? { ...s, xhr } : s)),
    );
  }

  function fail(localId: string, message: string) {
    setStaged((prev) =>
      prev.map((s) =>
        s.localId === localId ? { ...s, status: "error", error: message } : s,
      ),
    );
  }

  function retry(localId: string) {
    setStaged((prev) => {
      const entry = prev.find((s) => s.localId === localId);
      if (entry) send({ ...entry, status: "uploading", progress: 0 });
      return prev.map((s) =>
        s.localId === localId
          ? {
              ...s,
              status: "uploading" as const,
              progress: 0,
              error: undefined,
            }
          : s,
      );
    });
  }

  function removeStaged(localId: string) {
    setStaged((prev) => {
      const entry = prev.find((s) => s.localId === localId);
      entry?.xhr?.abort();
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((s) => s.localId !== localId);
    });
  }

  function removeCommitted(url: string) {
    onChange(images.filter((u) => u !== url));
  }

  function onFilesPicked(files: FileList | null) {
    if (!files) return;
    const room = Math.max(0, slotsLeft);
    Array.from(files).slice(0, room).forEach(upload);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((url) => (
          <div
            key={url}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-black02"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeCommitted(url)}
              aria-label="Remove image"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-pill bg-black02/70 text-offwhite opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        ))}

        {staged.map((s) => (
          <div
            key={s.localId}
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-black02/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.previewUrl}
              alt=""
              className="h-full w-full object-cover opacity-60"
            />
            {s.status === "uploading" ? (
              <div className="absolute inset-0 flex items-end bg-black02/10">
                <div
                  className="h-1.5 bg-primary transition-[width]"
                  style={{ width: `${s.progress}%` }}
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-danger-pastel/90 px-1 text-center">
                <Warning size={16} weight="fill" className="text-danger-ink" />
                <button
                  type="button"
                  onClick={() => retry(s.localId)}
                  aria-label="Retry upload"
                  className="rounded-pill bg-offwhite p-1"
                >
                  <ArrowClockwise size={12} weight="bold" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => removeStaged(s.localId)}
              aria-label="Cancel upload"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-pill bg-black02/70 text-offwhite"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        ))}

        {slotsLeft > 0 && (
          <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-black02/30 text-black02/65 hover:border-black02/50 hover:text-black02/70">
            <Plus size={18} weight="bold" aria-hidden />
            <span className="text-caption">Add</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => onFilesPicked(e.target.files)}
            />
          </label>
        )}
      </div>
      {staged.some((s) => s.status === "error") && (
        <p className="mt-2 text-caption text-danger-ink">
          One or more images failed to upload — the rest are unaffected. Retry
          or remove the failed one.
        </p>
      )}
    </div>
  );
}
