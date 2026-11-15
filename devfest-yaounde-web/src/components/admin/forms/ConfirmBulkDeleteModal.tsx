"use client";

import { Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

export interface BulkDeleteItem {
  id: string;
  label: string;
  impact: { blocked: boolean; message: string } | null;
}

/**
 * The bulk sibling of `ConfirmDeleteModal` (PHASE22 §E).
 *
 * A single delete types the record's own id back — there is no equivalent
 * for a set of different ids, so this asks for the word DELETE instead.
 * That is not a weaker confirmation: it is the same "deliberate second
 * action, not a second click" idea, sized to a plural target instead of
 * one specific id.
 *
 * BLOCKED ITEMS ARE NEVER SILENTLY DROPPED. `describeImpact` can refuse a
 * record the same way it already does for a single delete (a tier with
 * sold tickets, a product linked to real orders) — those are listed by
 * name and reason, kept out of the count that will actually be deleted,
 * and the confirm button's own label states the REDUCED number rather than
 * the original selection. Deleting the other N is still allowed; deleting
 * the blocked ones is not, and the difference is stated, not hidden.
 */
export function ConfirmBulkDeleteModal({
  items,
  busy,
  onConfirm,
  onCancel,
}: {
  items: BulkDeleteItem[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const node = dialogRef.current;
        if (!node) return;
        const focusable = node.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const blocked = items.filter((i) => i.impact?.blocked);
  const deletable = items.filter((i) => !i.impact?.blocked);
  const matches = typed.trim() === "DELETE";
  const canDelete = matches && deletable.length > 0 && !busy;

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-black02/50"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-bulk-delete-title"
        className="relative flex w-full max-w-lg flex-col gap-4 rounded-lg border-2 border-black02 bg-offwhite p-6 shadow-[0_8px_0_0_var(--color-black02)]"
      >
        <div className="flex items-start gap-3">
          <Warning
            size={22}
            weight="fill"
            className="mt-0.5 shrink-0 text-danger-ink"
            aria-hidden
          />
          <div>
            <h3
              id="confirm-bulk-delete-title"
              className="font-sans text-body-l font-bold text-black02"
            >
              Delete {deletable.length} record
              {deletable.length === 1 ? "" : "s"}?
            </h3>
            <p className="mt-1 text-body-m text-black02/70">
              This cannot be undone.
            </p>
          </div>
        </div>

        {deletable.length > 0 && (
          <ul className="max-h-32 overflow-y-auto rounded-lg border border-black02/15 bg-pastel px-3 py-2 text-caption text-black02/80">
            {deletable.map((i) => (
              <li key={i.id} className="truncate">
                {i.label}
              </li>
            ))}
          </ul>
        )}

        {blocked.length > 0 && (
          <div className="rounded-lg border-2 border-danger bg-danger-pastel px-4 py-3 text-body-m text-black02">
            <p className="font-bold">{blocked.length} kept, not deleted:</p>
            <ul className="mt-1 flex flex-col gap-1">
              {blocked.map((i) => (
                <li key={i.id} className="text-caption">
                  <span className="font-bold">{i.label}</span> —{" "}
                  {i.impact?.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {deletable.length > 0 ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-bold uppercase tracking-wide text-black02/65">
              Type <span className="font-mono text-black02">DELETE</span> to
              confirm
            </span>
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canDelete) onConfirm();
              }}
              className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-2.5 font-mono text-body-m text-black02"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        ) : (
          <p className="text-body-m font-bold text-danger-ink">
            Every selected record is blocked — nothing to delete.
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-pill border border-black02/25 px-4 py-2 font-sans text-body-m font-bold text-black02"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canDelete}
            onClick={onConfirm}
            className="rounded-pill bg-danger px-5 py-2 font-sans text-body-m font-bold text-offwhite disabled:opacity-40"
          >
            {busy ? "Deleting…" : `Delete ${deletable.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
