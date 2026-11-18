"use client";

import { useEffect, useState } from "react";
import { SITE_URL } from "@/lib/site-config";
import { useToast } from "../forms/Toast";
import { Panel } from "./shared";

type Status = "pending" | "approved" | "rejected";

interface Row {
  id: string;
  message: string;
  role: string | null;
  edition: string | null;
  locale: string;
  status: Status;
  createdAt: string;
}

const TABS: { key: Status; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "On the wall" },
  { key: "rejected", label: "Not shown" },
];

/**
 * Anonymous testimonials sent from /testimonial (ADR 0087). Nothing reaches
 * the wall's Stories until it is approved here. Self-fetching: these are not
 * part of the editorial content, so they do not travel with the dashboard's
 * main load.
 */
export function TestimonialSubmissions() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [tab, setTab] = useState<Status>("pending");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/testimonials", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { rows?: Row[] };
        if (!live) return;
        setUnavailable(!r.ok);
        setRows(body.rows ?? []);
      })
      .catch(() => {
        if (live) {
          setUnavailable(true);
          setRows([]);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  async function act(row: Row, action: Status | "delete") {
    if (
      action === "delete" &&
      !window.confirm("Delete this testimonial for good? This can't be undone.")
    ) {
      return;
    }
    setBusy(row.id);
    const res = await fetch(`/api/admin/testimonials/${row.id}`, {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: { "content-type": "application/json" },
      body:
        action === "delete" ? undefined : JSON.stringify({ status: action }),
    });
    setBusy(null);
    if (!res.ok) {
      toast.push("error", "That didn't save. Reload and try again.");
      return;
    }
    setRows((list) =>
      action === "delete"
        ? (list ?? []).filter((r) => r.id !== row.id)
        : (list ?? []).map((r) =>
            r.id === row.id ? { ...r, status: action } : r,
          ),
    );
  }

  const link = `${SITE_URL}/testimonial`;
  const count = (s: Status) =>
    (rows ?? []).filter((r) => r.status === s).length;
  const shown = (rows ?? []).filter((r) => r.status === tab);
  const button =
    "rounded-pill border-2 border-black02 px-3.5 py-1 text-caption font-bold text-black02 transition-colors disabled:opacity-40";

  return (
    <Panel
      title="Submissions"
      subtitle="Anonymous words from the testimonial page. Only approved ones appear on the wall's Stories."
      action={
        <button
          type="button"
          className={`${button} bg-offwhite hover:bg-pastel`}
          onClick={() => {
            void navigator.clipboard?.writeText(link);
            toast.push("ok", "Link copied");
          }}
        >
          Copy the share link
        </button>
      }
    >
      <p className="mb-4 font-mono text-caption text-black02/65">{link}</p>

      {unavailable && (
        <p className="mb-4 text-body-m text-black02/75">
          Submissions aren&apos;t available yet — migration 0039 hasn&apos;t
          been applied.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`${button} ${tab === key ? "bg-black02 text-offwhite" : "bg-transparent hover:bg-pastel"}`}
          >
            {label} · {count(key)}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="text-body-m text-black02/70">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-body-m text-black02/70">
          {tab === "pending" ? "Nothing waiting." : "None here."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((row) => (
            <li
              key={row.id}
              className="rounded-md border border-black02/15 bg-offwhite p-4"
            >
              <p
                lang={row.locale}
                className="whitespace-pre-line text-body-m text-black02"
              >
                {row.message}
              </p>
              <p className="mt-2 font-mono text-caption text-black02/60">
                {[
                  row.role,
                  row.edition,
                  row.locale.toUpperCase(),
                  new Date(row.createdAt).toLocaleString("en-GB", {
                    timeZone: "Africa/Douala",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {row.status !== "approved" && (
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void act(row, "approved")}
                    className={`${button} bg-primary hover:bg-halftone`}
                  >
                    Approve
                  </button>
                )}
                {row.status !== "rejected" && (
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void act(row, "rejected")}
                    className={`${button} bg-transparent hover:bg-pastel`}
                  >
                    {row.status === "approved"
                      ? "Take off the wall"
                      : "Don't show"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => void act(row, "delete")}
                  className={`${button} bg-transparent hover:bg-pastel`}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
