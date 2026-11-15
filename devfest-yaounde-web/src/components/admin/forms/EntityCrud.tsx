"use client";

import { ArrowsDownUp, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useToast } from "./Toast";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { ConfirmBulkDeleteModal } from "./ConfirmBulkDeleteModal";

/**
 * The plumbing behind every content list, once.
 *
 * WHY A SHELL AND NOT A FORM GENERATOR. The brief asked for a dedicated,
 * well-designed form per entity, and a schema-driven generator produces the
 * opposite — a column of identical boxes, which is exactly what it asked us
 * not to build. But writing the list, the drawer, the dirty tracking, the
 * confirm-before-delete and the save round-trip five times would mean five
 * places for those to drift apart.
 *
 * So the SHELL is shared and the FIELDS are not: each entity passes its own
 * layout as `renderForm`, and gets the same reliable behaviour around it.
 *
 * HOW SAVING WORKS. There is no per-record endpoint, and none was added: the
 * store keeps one row per collection, holding the whole array
 * (ADR 0031). So editing one record reads the array, replaces one element and
 * PUTs the array back through `PUT /api/admin/content/:id`, which already
 * does organiser authz, rate limiting, Zod validation and the audit entry.
 *
 * That has one consequence worth stating plainly rather than discovering: two
 * organisers editing different records at the same time will have the second
 * save overwrite the first, because both wrote the whole array. `baseline`
 * guards it — see the check in `commit`.
 */

/**
 * All the shell needs to know about a record.
 *
 * Deliberately not an index signature: adding one would let every real entity
 * type through, but it would also erase the type-checking inside each form —
 * `patch({ nmae: … })` would compile.
 */
export interface EntityRow {
  id: string;
}

export interface EntityCrudProps<T extends EntityRow> {
  /** Collection id, e.g. "team" — also the API path segment. */
  collection: string;
  rows: T[];
  /** A blank record, for the "add" button. */
  blank: () => T;
  /** One row's summary in the list. */
  renderRow: (row: T) => ReactNode;
  /** The entity's own form. */
  renderForm: (draft: T, patch: (changes: Partial<T>) => void) => ReactNode;
  /** Whether the order of this collection is meaningful. */
  reorderable?: boolean;
  addLabel: string;
  emptyLabel: string;
  /**
   * Runs after the record is safely written — this is where a photo picked
   * in the form gets uploaded, because the upload endpoint attaches to a
   * record that has to exist first.
   */
  afterSave?: (saved: T) => Promise<void>;
  /** Called when the drawer closes, so a form can drop its unsaved state. */
  onClose?: () => void;
  /**
   * Narrows what the LIST SHOWS. Never what is saved.
   *
   * That distinction is the whole reason this is a prop rather than something
   * a caller does to `rows` before passing them in. Every save writes the
   * WHOLE array (ADR 0031), so filtering upstream would mean saving a
   * filtered list — one search for "Ada", one edit, and everybody else is
   * deleted. Here the filter reaches the render and nothing else.
   */
  filter?: (row: T) => boolean;
  /** A search or filter bar, rendered above the list. */
  toolbar?: ReactNode;
  /**
   * A switch on each row that saves the moment it is pressed.
   *
   * Lives here rather than in each view so it goes through the same
   * whole-array write, concurrency check, error toast and rollback as every
   * other save. A view flipping a boolean and PUTting on its own would be a
   * second, quieter write path with none of that.
   *
   * OPTIMISTIC, with a shimmer over the row until the round trip lands —
   * the DP wall's toggle pattern (Phase 19), and for its reason: a toggle
   * that does nothing for a second reads as a toggle that missed, and the
   * reaction to that is to press it again, which queues a second write
   * undoing the first. On failure the flip is rolled back and a toast says
   * so, because a row silently disagreeing with the database is worse than
   * one that never flipped.
   */
  rowToggle?: {
    /** Reads the current state off a row. */
    value: (row: T) => boolean;
    /** Returns the row with the state flipped. */
    apply: (row: T, next: boolean) => T;
    /** Button label, given the row's CURRENT state. */
    label: (on: boolean) => string;
    /** Toast on success, given the NEW state. */
    saved: (on: boolean) => string;
  };
  /**
   * Runs before a delete is allowed through. Returning `{ blocked: true, ... }`
   * disables the confirm control entirely — for records an integrity rule
   * says should never be hard-deleted (a tier with sold tickets, a product
   * linked to real orders). Returning `null` skips the impact message but
   * still requires the double-confirmation (typing the id).
   */
  describeImpact?: (row: T) => { blocked: boolean; message: string } | null;
  /**
   * Split the list in two, with the "on" group first under a quiet label.
   *
   * Only meaningful alongside `rowToggle`, which supplies the on/off reading
   * — this just decides whether that split is worth showing. Published work
   * is what an organiser came to find; hidden rows are the exception and
   * belong after it, not interleaved by insertion order. Suppressed while
   * `reorderable` is on, because the arrows move rows by array index and a
   * regrouped list no longer matches that order.
   */
  sections?: { on: string; off: string };
  /**
   * Opens a row's editor on mount — the deep-link target for `?edit=<id>`
   * links from another view.
   */
  initialEditId?: string;
}

export function EntityCrud<T extends EntityRow>({
  collection,
  rows: initialRows,
  blank,
  renderRow,
  renderForm,
  reorderable = false,
  addLabel,
  emptyLabel,
  afterSave,
  onClose,
  filter,
  toolbar,
  rowToggle,
  sections,
  describeImpact,
  initialEditId,
}: EntityCrudProps<T>) {
  const toast = useToast();
  const [rows, setRows] = useState<T[]>(initialRows);
  /**
   * What the server had when this page loaded.
   *
   * Compared before every write so a save cannot silently overwrite an edit
   * somebody else made in the meantime — the whole array goes up each time,
   * so without this the loser of a race never finds out.
   */
  const [baseline, setBaseline] = useState<T[]>(initialRows);
  /**
   * Deep-linked from another view ("finish this draft") — a lazy initializer
   * rather than an effect, so the editor is open on the very first render
   * instead of flashing the list first. Only ever consulted once: reopening
   * this same row later goes through `open()` like any other edit.
   */
  const [draft, setDraft] = useState<T | null>(() => {
    if (!initialEditId) return null;
    const target = initialRows.find((r) => r.id === initialEditId);
    return target ? { ...target } : null;
  });
  const [isNew, setIsNew] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which rows' toggle is mid-flight — drives their shimmer. A set rather
   *  than a single id because a bulk publish/hide flips several at once. */
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  /** Rows checked for a bulk action — cleared on every commit. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirming, setBulkConfirming] = useState(false);

  function open(row: T, fresh: boolean) {
    // Whatever was picked for the last record is not this record's.
    onClose?.();
    setDraft({ ...row });
    setIsNew(fresh);
  }

  /** Read what the server currently holds, so a stale tab can recover. */
  async function fetchCurrent(): Promise<T[] | null> {
    const res = await fetch(`/api/admin/content/${collection}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { payload?: T[] };
    return data.payload ?? [];
  }

  async function commit(next: T[], message: string, saved?: T) {
    setBusy(true);
    try {
      const current = await fetchCurrent();
      if (current && JSON.stringify(current) !== JSON.stringify(baseline)) {
        toast.push(
          "error",
          "Someone else changed this list while you were editing. Reload before saving so their work is not lost.",
        );
        setBusy(false);
        return;
      }

      const res = await fetch(`/api/admin/content/${collection}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          detail?: string;
        } | null;
        // The server's Zod message is far more useful than "failed" — it
        // names the field.
        toast.push("error", body?.detail ?? "That did not save.");
        setBusy(false);
        return;
      }

      setRows(next);
      setBaseline(next);
      setDraft(null);
      onClose?.();

      if (saved && afterSave) {
        await afterSave(saved);
        /*
          RE-READ, and it is not optional.

          `afterSave` uploads a photo, and that endpoint writes `photoUrl`
          onto the record server-side. Our `rows` and `baseline` still hold
          the version without it — so the list would show no picture, and the
          NEXT save would either post a payload that blanks the photo or be
          refused by the concurrency guard as somebody else's edit. Both are
          confusing and one loses the upload.
        */
        const fresh = await fetchCurrent();
        if (fresh) {
          setRows(fresh);
          setBaseline(fresh);
        }
      }
      toast.push("ok", message);
    } catch {
      toast.push("error", "Could not reach the server.");
    }
    setBusy(false);
  }

  async function save() {
    if (!draft) return;
    const id = draft.id.trim();
    if (!id) {
      toast.push("error", "An id is required — it is what the URL uses.");
      return;
    }
    if (isNew && rows.some((r) => r.id === id)) {
      toast.push("error", `There is already an entry with the id "${id}".`);
      return;
    }
    const next = isNew
      ? [...rows, draft]
      : rows.map((r) => (r.id === draft.id ? draft : r));
    await commit(next, isNew ? "Added." : "Saved.", draft);
  }

  async function remove(id: string) {
    setConfirming(null);
    await commit(
      rows.filter((r) => r.id !== id),
      "Deleted.",
    );
  }

  /**
   * Bulk delete — at least as safe as the single-record path, not a
   * shortcut around it (PHASE22 §E).
   *
   * `describeImpact` is checked per selected row, exactly like the single
   * delete already does, and a blocked row is NEVER silently dropped from
   * view: `ConfirmBulkDeleteModal` lists it by name and reason, and only
   * the un-blocked rows are removed. One whole-array commit either way —
   * N separate DELETE-equivalents would mean N concurrency checks racing
   * each other the same way bulk publish/hide would.
   */
  async function confirmBulkDelete(deletableIds: Set<string>) {
    if (deletableIds.size === 0) return;
    setBulkConfirming(false);
    setSelected(new Set());
    await commit(
      rows.filter((r) => !deletableIds.has(r.id)),
      `Deleted ${deletableIds.size} record${deletableIds.size === 1 ? "" : "s"}.`,
    );
  }

  async function flip(row: T) {
    if (!rowToggle || togglingIds.has(row.id)) return;
    const next = !rowToggle.value(row);
    const flipped = rows.map((r) =>
      r.id === row.id ? rowToggle.apply(r, next) : r,
    );

    // On screen immediately; the shimmer says the server has not agreed yet.
    const previous = rows;
    setRows(flipped);
    setTogglingIds(new Set([row.id]));

    try {
      const current = await fetchCurrent();
      if (current && JSON.stringify(current) !== JSON.stringify(baseline)) {
        setRows(previous);
        toast.push(
          "error",
          "Someone else changed this list while you were editing. Reload before saving so their work is not lost.",
        );
        setTogglingIds(new Set());
        return;
      }

      const res = await fetch(`/api/admin/content/${collection}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: flipped }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          detail?: string;
        } | null;
        setRows(previous);
        toast.push("error", body?.detail ?? "That did not save.");
        setTogglingIds(new Set());
        return;
      }

      setBaseline(flipped);
      toast.push("ok", rowToggle.saved(next));
    } catch {
      setRows(previous);
      toast.push("error", "Could not reach the server — put back as it was.");
    }
    setTogglingIds(new Set());
  }

  /**
   * Bulk publish/hide — the same whole-array write `flip` uses, just with
   * more than one row changed before the single commit. One round trip
   * rather than N: besides being faster, N separate writes would each run
   * their own concurrency check against a `baseline` that the FIRST write
   * already moved past, so writes 2..N would spuriously fail as "someone
   * else changed this list" against their own sibling.
   */
  async function bulkFlip(next: boolean) {
    if (!rowToggle || selected.size === 0) return;
    const ids = new Set(selected);
    const flipped = rows.map((r) =>
      ids.has(r.id) ? rowToggle.apply(r, next) : r,
    );

    const previous = rows;
    setRows(flipped);
    setTogglingIds(ids);

    try {
      const current = await fetchCurrent();
      if (current && JSON.stringify(current) !== JSON.stringify(baseline)) {
        setRows(previous);
        toast.push(
          "error",
          "Someone else changed this list while you were editing. Reload before saving so their work is not lost.",
        );
        setTogglingIds(new Set());
        return;
      }

      const res = await fetch(`/api/admin/content/${collection}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: flipped }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          detail?: string;
        } | null;
        setRows(previous);
        toast.push("error", body?.detail ?? "That did not save.");
        setTogglingIds(new Set());
        return;
      }

      setBaseline(flipped);
      setSelected(new Set());
      // The row's OWN verb, read at the state it is moving FROM — "Put on
      // sale" for a bulk turn-on, "Hide" for a bulk turn-off — so this reads
      // in whatever vocabulary the collection already uses, with no new
      // per-collection copy required.
      toast.push(
        "ok",
        `${rowToggle.label(!next)} — ${ids.size} record${ids.size === 1 ? "" : "s"}.`,
      );
    } catch {
      setRows(previous);
      toast.push("error", "Could not reach the server — put back as it was.");
    }
    setTogglingIds(new Set());
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    await commit(next, "Order saved.");
  }

  /*
    What is on screen, which is not what gets written. `rows` stays whole for
    every save; `shown` is only ever rendered.
  */
  const shown = filter ? rows.filter(filter) : rows;
  const filtered = shown.length !== rows.length;

  /*
   * Published-first split.
   *
   * Only when there is a toggle to read the state from AND the list is not
   * reorderable — the arrows move rows by array index, and a regrouped list
   * no longer reads in that order, so offering both would make "move up"
   * mean something different from where the row appears to sit.
   */
  const readState = rowToggle?.value;
  const grouped = sections && readState && !reorderable ? sections : null;
  const onRows = grouped && readState ? shown.filter(readState) : [];
  const offRows =
    grouped && readState ? shown.filter((row) => !readState(row)) : [];

  /**
   * One row. Extracted so the flat list and the sectioned one render
   * byte-identical rows — the split is about ORDER and a label, and must
   * not become a second row implementation that drifts.
   *
   * `index` is the row's position in `rows`, not in what is on screen:
   * the reorder arrows swap by array index, so passing the screen index
   * would move the wrong row as soon as anything was filtered out.
   */
  function renderItem(row: T, index: number) {
    const isToggling = togglingIds.has(row.id);
    const isSelected = selected.has(row.id);
    return (
      <li
        key={row.id}
        className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-lg border border-black02/15 bg-offwhite px-4 py-3"
      >
        {/*
              The DP wall's busy veil, on the row that is waiting. Purely
              decorative — the toggle's own `aria-pressed` and the toast
              carry the state for anyone not looking at it.
            */}
        {isToggling && <span aria-hidden className="admin-shimmer" />}
        {/*
              Bulk selection (PHASE22 §E) — every row, on every collection
              that uses this shell, with no per-view opt-in required.
            */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            const next = new Set(selected);
            if (e.target.checked) next.add(row.id);
            else next.delete(row.id);
            setSelected(next);
          }}
          aria-label={`Select ${row.id}`}
          className="h-4 w-4 shrink-0 accent-black02"
        />
        {/*
              Faded, not struck through or greyed to unreadable: the record
              is intact and one press from being back, and it still has to
              be legible enough to find.
            */}
        <div
          className={`min-w-0 flex-1 ${
            rowToggle && !rowToggle.value(row) ? "opacity-45" : ""
          }`}
        >
          {renderRow(row)}
        </div>

        {/*
              REORDERING IS HIDDEN WHILE FILTERED, not disabled-looking.

              The arrows swap a row with its neighbour by index, and under a
              filter the row above on screen is not the row above in the
              array. "Move up" would jump over however many rows the filter
              is hiding — a silent, wrong reorder. Clear the filter and they
              come back.
            */}
        {reorderable && !filtered && (
          <span className="flex items-center gap-0.5">
            {/*
                  Buttons, not a drag handle. Dragging is the nicer gesture
                  and the worse control here: it is unusable from a
                  keyboard, awkward on a phone, and this list is edited on
                  both. Each press saves, so the order in the database is
                  always the order on screen.
                */}
            <button
              type="button"
              disabled={busy || index === 0}
              onClick={() => void move(index, -1)}
              aria-label={`Move ${row.id} up`}
              className="rounded-pill p-1.5 text-black02/65 hover:bg-pastel hover:text-black02 disabled:opacity-25"
            >
              <ArrowsDownUp size={14} weight="bold" className="rotate-180" />
            </button>
            <button
              type="button"
              disabled={busy || index === rows.length - 1}
              onClick={() => void move(index, 1)}
              aria-label={`Move ${row.id} down`}
              className="rounded-pill p-1.5 text-black02/65 hover:bg-pastel hover:text-black02 disabled:opacity-25"
            >
              <ArrowsDownUp size={14} weight="bold" />
            </button>
          </span>
        )}

        {rowToggle && (
          <button
            type="button"
            disabled={busy || isToggling}
            onClick={() => void flip(row)}
            aria-pressed={rowToggle.value(row)}
            aria-busy={isToggling}
            className={`rounded-pill border-2 px-3 py-1 text-caption font-bold transition-colors disabled:opacity-50 ${
              rowToggle.value(row)
                ? "border-black02/25 text-black02/65 hover:bg-pastel hover:text-black02"
                : "border-success text-success-ink hover:bg-success-pastel"
            }`}
          >
            {rowToggle.label(rowToggle.value(row))}
          </button>
        )}

        <button
          type="button"
          onClick={() => open(row, false)}
          aria-label={`Edit ${row.id}`}
          className="rounded-pill border border-black02/20 p-2 text-black02 hover:bg-pastel"
        >
          <PencilSimple size={14} weight="bold" />
        </button>

        <button
          type="button"
          onClick={() => setConfirming(row.id)}
          aria-label={`Delete ${row.id}`}
          className="rounded-pill border border-black02/20 p-2 text-black02 hover:bg-danger-pastel hover:text-danger-ink"
        >
          <Trash size={14} weight="bold" />
        </button>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <button
          type="button"
          onClick={() => open(blank(), true)}
          className="inline-flex items-center gap-2 rounded-pill border border-black02/25 bg-primary px-4 py-2 font-sans text-body-m font-bold text-black02 hover:brightness-95"
        >
          <Plus size={16} weight="bold" aria-hidden />
          {addLabel}
        </button>
      </div>

      {rows.length > 0 && filtered && (
        <p className="text-caption text-black02/65">
          Showing {shown.length} of {rows.length}.
        </p>
      )}

      {/*
        Bulk actions (PHASE22 §E) — select-all scoped to what a FILTER is
        currently showing, never the whole underlying array, the same rule
        `filter` already applies to everything else in this shell: what is
        on screen is what an action here can reach, nothing hidden by a
        search box gets touched by accident.
      */}
      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-black02/15 bg-pastel/40 px-4 py-2.5">
          <label className="flex items-center gap-2 text-caption font-bold text-black02/70">
            <input
              type="checkbox"
              checked={
                selected.size > 0 && shown.every((row) => selected.has(row.id))
              }
              ref={(el) => {
                if (!el) return;
                const some = shown.some((row) => selected.has(row.id));
                const all = shown.every((row) => selected.has(row.id));
                el.indeterminate = some && !all;
              }}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelected(new Set(shown.map((row) => row.id)));
                } else {
                  setSelected(new Set());
                }
              }}
              className="h-4 w-4 accent-black02"
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </label>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {rowToggle && (
                <>
                  <button
                    type="button"
                    disabled={busy || togglingIds.size > 0}
                    onClick={() => void bulkFlip(true)}
                    className="rounded-pill border-2 border-success px-3 py-1 font-sans text-caption font-bold text-success-ink hover:bg-success-pastel disabled:opacity-40"
                  >
                    {rowToggle.label(false)}
                  </button>
                  <button
                    type="button"
                    disabled={busy || togglingIds.size > 0}
                    onClick={() => void bulkFlip(false)}
                    className="rounded-pill border-2 border-black02/25 px-3 py-1 font-sans text-caption font-bold text-black02/65 hover:bg-pastel disabled:opacity-40"
                  >
                    {rowToggle.label(true)}
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => setBulkConfirming(true)}
                className="rounded-pill border-2 border-danger px-3 py-1 font-sans text-caption font-bold text-danger-ink hover:bg-danger-pastel disabled:opacity-40"
              >
                Delete selected
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="font-mono text-caption font-bold uppercase tracking-wide text-black02/65 underline decoration-2 underline-offset-2 hover:text-black02"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black02/25 px-4 py-10 text-center text-body-m text-black02/65">
          {rows.length === 0 ? emptyLabel : "Nothing matches that."}
        </p>
      ) : grouped ? (
        /*
          Published first, hidden after, each under a quiet label.

          Two lists rather than one with separator rows: a heading that is
          a sibling of the items it introduces is a heading an assistive
          technology can skip to, and `<li>` pretending to be a divider is
          an item that is not one.
        */
        <div className="flex flex-col gap-5">
          {[[grouped.on, onRows] as const, [grouped.off, offRows] as const]
            .filter(([, group]) => group.length > 0)
            .map(([label, group]) => (
              <section key={label}>
                <h3 className="mb-2 font-mono text-caption font-bold uppercase tracking-wide text-black02/65">
                  {label}
                  <span className="ml-1.5 font-normal">({group.length})</span>
                </h3>
                <ul className="flex flex-col gap-2">
                  {group.map((row) => renderItem(row, rows.indexOf(row)))}
                </ul>
              </section>
            ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => renderItem(row, rows.indexOf(row)))}
        </ul>
      )}

      {confirming &&
        (() => {
          const row = rows.find((r) => r.id === confirming);
          if (!row) return null;
          const impact = describeImpact?.(row) ?? null;
          return (
            <ConfirmDeleteModal
              id={row.id}
              label={`"${row.id}"`}
              impact={impact}
              busy={busy}
              onConfirm={() => void remove(row.id)}
              onCancel={() => setConfirming(null)}
            />
          );
        })()}

      {bulkConfirming && (
        <ConfirmBulkDeleteModal
          items={rows
            .filter((row) => selected.has(row.id))
            .map((row) => ({
              id: row.id,
              label: row.id,
              impact: describeImpact?.(row) ?? null,
            }))}
          busy={busy}
          onConfirm={() => {
            const deletableIds = new Set(
              rows
                .filter(
                  (row) =>
                    selected.has(row.id) && !describeImpact?.(row)?.blocked,
                )
                .map((row) => row.id),
            );
            void confirmBulkDelete(deletableIds);
          }}
          onCancel={() => setBulkConfirming(false)}
        />
      )}

      {draft && (
        <EditorDrawer
          title={isNew ? addLabel : `Edit ${draft.id}`}
          busy={busy}
          onClose={() => {
            setDraft(null);
            onClose?.();
          }}
          onSave={() => void save()}
        >
          {renderForm(draft, (changes) =>
            setDraft((d) => (d ? { ...d, ...changes } : d)),
          )}
        </EditorDrawer>
      )}
    </div>
  );
}

/**
 * The editing surface: a panel over the list rather than a separate page.
 *
 * The list stays behind it, so it is obvious what is being edited and where
 * it sits — and closing costs nothing, which matters when the answer to "what
 * was this person's id again?" is one Escape away.
 */
function EditorDrawer({
  title,
  busy,
  children,
  onClose,
  onSave,
}: {
  title: string;
  busy: boolean;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-70 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black02/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-[min(38rem,100vw)] flex-col overflow-hidden border-l border-black02/20 bg-offwhite"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black02/15 px-5 py-4">
          <h3 className="font-sans text-heading-m font-bold text-black02">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill px-3 py-1.5 text-body-m font-bold text-black02/65 hover:bg-pastel hover:text-black02"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-5">{children}</div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-black02/15 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill border border-black02/25 px-4 py-2 font-sans text-body-m font-bold text-black02"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="rounded-pill bg-primary px-5 py-2 font-sans text-body-m font-bold text-black02 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
