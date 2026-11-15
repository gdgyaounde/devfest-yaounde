"use client";

import { useState } from "react";
import { Warning } from "@phosphor-icons/react";
import type { AdminData, AdminRefundRequest } from "@/lib/admin/shape";
import { ConfirmDeleteModal } from "../forms/ConfirmDeleteModal";
import { DataTable, ExportButton, InfoBanner, Panel, when } from "./shared";

/**
 * Same transition table as `lib/admin/refund-lifecycle.ts`, duplicated
 * client-side rather than imported — that module is `server-only`, and the
 * server re-validates every transition on write regardless (this copy only
 * decides which buttons to show, not what the server will accept). Same
 * pattern `AdminOrders.tsx`'s `NEXT_STATUS` already uses for the identical
 * reason.
 */
const NEXT_STATUS: Record<string, string[]> = {
  requested: ["in_progress", "resolved", "denied"],
  in_progress: ["resolved", "denied", "requested"],
  resolved: [],
  denied: ["in_progress"],
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  in_progress: "In progress",
  resolved: "Resolved",
  denied: "Denied",
};

const EMPTY_FORM = {
  kind: "tickets" as "tickets" | "shop",
  reference: "",
  requesterName: "",
  requesterEmail: "",
  reason: "",
  notes: "",
};

/**
 * A visibility tracker for manual refund/exchange requests (PHASE22 §D).
 *
 * This does not move money and never will — tickets stay non-refundable and
 * shop exchanges stay handled off-platform
 * (`docs/content/refund-policy.md`). What this replaces is "somewhere to
 * look" for a request that came in by email: today it is a record an
 * organiser logs, moves through requested → in progress → resolved/denied,
 * and can add a note to — not a queue that emails anyone or a form the
 * public can submit.
 */
export function AdminRefundTracker({ data }: { data: AdminData }) {
  const rows = data.refundRequests.rows;
  const [refreshed, setRefreshed] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRefundRequest | null>(
    null,
  );

  async function submit() {
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch("/api/admin/refund-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: form.kind,
          reference: form.reference.trim(),
          requesterName: form.requesterName.trim(),
          requesterEmail: form.requesterEmail.trim(),
          reason: form.reason.trim(),
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFormError(body?.error ?? `Failed (${response.status})`);
      } else {
        setForm(EMPTY_FORM);
        setRefreshed(true);
      }
    } catch {
      setFormError("Network error");
    }
    setSubmitting(false);
  }

  const canSubmit =
    form.reference.trim().length > 0 &&
    form.requesterName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(form.requesterEmail.trim()) &&
    form.reason.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <InfoBanner>
        This is a visibility tracker, not a refund tool — it records a request
        and its status, nothing more. Tickets stay non-refundable; shop
        exchanges stay handled off-platform. See{" "}
        <span className="font-mono">docs/content/refund-policy.md</span>.
      </InfoBanner>

      <Panel title="Log a request">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
              Kind
            </span>
            <select
              value={form.kind}
              onChange={(e) =>
                setForm({ ...form, kind: e.target.value as "tickets" | "shop" })
              }
              className="rounded-lg border-2 border-black02 bg-offwhite px-3 py-2 font-sans text-body-m text-black02"
            >
              <option value="tickets">Tickets</option>
              <option value="shop">Shop</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
              Reference
            </span>
            <input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="Badge code, deposit id, order id…"
              className="rounded-lg border-2 border-black02 bg-offwhite px-3 py-2 font-sans text-body-m text-black02"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
              Requester name
            </span>
            <input
              value={form.requesterName}
              onChange={(e) =>
                setForm({ ...form, requesterName: e.target.value })
              }
              className="rounded-lg border-2 border-black02 bg-offwhite px-3 py-2 font-sans text-body-m text-black02"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
              Requester email
            </span>
            <input
              type="email"
              value={form.requesterEmail}
              onChange={(e) =>
                setForm({ ...form, requesterEmail: e.target.value })
              }
              className="rounded-lg border-2 border-black02 bg-offwhite px-3 py-2 font-sans text-body-m text-black02"
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
              Reason
            </span>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              rows={2}
              className="rounded-lg border-2 border-black02 bg-offwhite px-3 py-2 font-sans text-body-m text-black02"
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/70">
              Notes (optional)
            </span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="rounded-lg border-2 border-black02 bg-offwhite px-3 py-2 font-sans text-body-m text-black02"
            />
          </label>
        </div>

        {formError && (
          <p className="mt-3 flex items-center gap-2 text-body-m font-bold text-danger-ink">
            <Warning size={16} weight="fill" aria-hidden />
            {formError}
          </p>
        )}

        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={() => void submit()}
          className="mt-4 rounded-pill border-2 border-black02 bg-primary px-5 py-2.5 font-sans text-body-m font-bold text-black02 disabled:opacity-40"
        >
          {submitting ? "Logging…" : "Log request"}
        </button>
      </Panel>

      <Panel
        title="Refund & exchange requests"
        subtitle={`Showing ${rows.length} of ${data.refundRequests.total}.`}
        action={
          <ExportButton
            filename="devfest-refund-requests.csv"
            headers={[
              "Id",
              "Kind",
              "Reference",
              "Requester",
              "Email",
              "Reason",
              "Status",
              "Notes",
              "Logged",
            ]}
            rows={rows.map((r) => [
              r.id,
              r.kind,
              r.reference,
              r.requesterName,
              r.requesterEmail,
              r.reason,
              r.status,
              r.notes ?? "",
              r.createdAt,
            ])}
          />
        }
      >
        {refreshed && (
          <p className="mb-4 rounded-lg border-2 border-black02 bg-primary px-4 py-2.5 text-body-m font-bold text-black02">
            Saved. Reload the page to see the change — this view was rendered
            once, and does not poll.
          </p>
        )}
        <DataTable
          headers={[
            "Reference",
            "Kind",
            "Requester",
            "Reason",
            "Status",
            "Logged",
            "Move to",
            "",
          ]}
          empty="No requests logged yet."
          rows={rows.map((r) => [
            <span key="ref" className="font-mono text-caption">
              {r.reference}
            </span>,
            r.kind,
            <span key="who">
              {r.requesterName}
              <span className="block text-caption text-black02/65">
                {r.requesterEmail}
              </span>
            </span>,
            <span key="reason" className="block max-w-xs truncate">
              {r.reason}
            </span>,
            <span key="status" className="font-bold">
              {STATUS_LABEL[r.status] ?? r.status}
            </span>,
            when(r.createdAt),
            <RequestActions
              key="actions"
              request={r}
              onDone={() => setRefreshed(true)}
            />,
            <button
              key="delete"
              type="button"
              onClick={() => setDeleteTarget(r)}
              className="rounded-pill border-2 border-danger px-3 py-1 font-sans text-caption font-bold text-danger-ink hover:bg-danger-pastel"
            >
              Delete
            </button>,
          ])}
        />
      </Panel>

      {deleteTarget && (
        <ConfirmDeleteModal
          id={deleteTarget.id}
          label={`refund request "${deleteTarget.reference}"`}
          impact={null}
          busy={false}
          onConfirm={async () => {
            const response = await fetch(
              `/api/admin/refund-requests/${deleteTarget.id}`,
              { method: "DELETE" },
            );
            if (response.ok) {
              setDeleteTarget(null);
              setRefreshed(true);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function RequestActions({
  request,
  onDone,
}: {
  request: AdminRefundRequest;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(status: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/refund-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `Failed (${response.status})`);
      } else {
        onDone();
      }
    } catch {
      setError("Network error");
    }
    setBusy(false);
  }

  const options = NEXT_STATUS[request.status] ?? [];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {options.length === 0 ? (
        <span className="text-black02/65">—</span>
      ) : (
        options.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => void move(s)}
            className="rounded-pill border-2 border-black02 bg-offwhite px-3 py-1 font-sans text-caption font-bold text-black02 hover:bg-primary disabled:opacity-40"
          >
            {STATUS_LABEL[s] ?? s.replace(/_/g, " ")}
          </button>
        ))
      )}
      {error && (
        <span className="text-caption font-bold text-danger-ink">{error}</span>
      )}
    </span>
  );
}
