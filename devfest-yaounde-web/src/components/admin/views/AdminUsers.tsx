"use client";

import { HandWaving, ShieldCheck } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  LIST_CAP,
  type AdminAdmin,
  type AdminData,
  type AdminVolunteer,
} from "@/lib/admin/shape";
import type { RoleAction } from "@/lib/admin/organiser-roles";
import { Badge } from "@/components/ui/Badge";
import { ConfirmRoleChangeModal } from "../forms/ConfirmRoleChangeModal";
import { useToast } from "../forms/Toast";
import { DataTable, InfoBanner, Panel, maskEmail, when } from "./shared";

/** What each refusal means, in words an organiser can act on. */
const ERROR_COPY: Record<string, string> = {
  last_admin:
    "This is the last admin, so it can't be removed. Make someone else an admin first — the dashboard must always have at least one.",
  self_confirmation_required:
    "Removing your own access needs the extra confirmation. Tick the box and try again.",
  actor_not_admin:
    "You no longer have admin access, so this can't be done. Reload the page.",
  forbidden:
    "You no longer have admin access, so this can't be done. Reload the page.",
  target_not_found: "That account no longer exists.",
  confirmation_mismatch: "The address you typed doesn't match this account.",
  rate_limited:
    "Too many role changes in a short time. Wait a few minutes and try again.",
  cross_origin: "The request was rejected. Reload the page and try again.",
  invalid_body: "The request was rejected. Reload the page and try again.",
  server_error:
    "Something went wrong on the server and nothing was changed. If it keeps happening, the role-management migration (0026) may not be applied yet.",
};

interface Pending {
  action: RoleAction;
  id: string;
  name: string;
  email: string;
}

/**
 * Users, and who is an admin (PHASE23 §E).
 *
 * The list of current admins is shown FIRST and in full — addresses
 * unmasked, because here the address is the point of the row and this is the
 * one screen where nobody should ever change access without seeing exactly
 * who holds it. The wider "who has signed in" list keeps its masked
 * addresses (see the note below).
 *
 * Everything that matters is enforced on the server and in the database, not
 * here: the last admin can never be removed (`set_organiser_role`, migration
 * 0026, plus a trigger). The disabled button below is a courtesy so nobody
 * clicks into a refusal, not the protection.
 */
export function AdminUsers({ data }: { data: AdminData }) {
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminAdmin[]>(data.admins);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminIds = useMemo(() => new Set(admins.map((a) => a.id)), [admins]);
  const [volunteers, setVolunteers] = useState<AdminVolunteer[]>(
    data.volunteers,
  );
  const [volunteerBusy, setVolunteerBusy] = useState<string | null>(null);
  // Snapshot of "now" for the active/expired split, taken once per mount —
  // the list is reloaded with the page, and a render must stay pure.
  const [now] = useState(() => Date.now());
  const activeVolunteerIds = useMemo(
    () =>
      new Set(
        volunteers
          .filter((v) => Date.parse(v.expiresAt) > now)
          .map((v) => v.id),
      ),
    [volunteers, now],
  );

  /**
   * Add or remove a volunteer. No typed-email confirmation, unlike admin
   * changes: a volunteer can only scan badges, hand out perks and hand over
   * pickup orders, until the day after the event — and it is one click to
   * undo. The audit row is written by the database either way.
   */
  async function changeVolunteer(
    action: "add" | "remove",
    id: string,
    name: string,
    email: string | null,
  ) {
    setVolunteerBusy(id);
    try {
      const response = await fetch("/api/admin/volunteers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, action }),
      });
      const body = (await response.json().catch(() => null)) as {
        expiresAt?: string;
        message?: string;
      } | null;
      if (!response.ok) {
        toast.push(
          "error",
          body?.message ??
            (response.status === 500
              ? "Nothing changed — the volunteers migration (0032) may not be applied yet."
              : `That did not go through (${response.status}).`),
        );
        return;
      }
      if (action === "add") {
        setVolunteers((current) => [
          ...current.filter((v) => v.id !== id),
          {
            id,
            displayName: name,
            email,
            addedAt: new Date().toISOString(),
            expiresAt: body?.expiresAt ?? new Date().toISOString(),
          },
        ]);
        toast.push("ok", `${name} is now a volunteer.`);
      } else {
        setVolunteers((current) => current.filter((v) => v.id !== id));
        toast.push("ok", `${name} is no longer a volunteer.`);
      }
    } catch {
      toast.push("error", "Network error — nothing was changed. Try again.");
    } finally {
      setVolunteerBusy(null);
    }
  }
  const onlyOneAdmin = admins.length <= 1;

  const shownUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? data.users.rows.filter((u) =>
          [u.displayName, u.email].some((v) => v?.toLowerCase().includes(q)),
        )
      : data.users.rows;
  }, [data.users.rows, query]);

  const nameOf = (
    id: string,
    fallbackName: string | null,
    email: string | null,
  ) => fallbackName ?? email ?? id.slice(0, 8);

  function open(
    action: RoleAction,
    id: string,
    name: string | null,
    email: string | null,
  ) {
    setError(null);
    // An account with no email has nothing to type back, so it cannot be
    // confirmed — and therefore cannot be changed from here.
    if (!email) {
      toast.push(
        "error",
        "This account has no email address, so it can't be confirmed.",
      );
      return;
    }
    setPending({ action, id, name: nameOf(id, name, email), email });
  }

  async function submit(input: { typedEmail: string; confirmSelf: boolean }) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/organisers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: pending.id,
          action: pending.action,
          confirmEmail: input.typedEmail,
          ...(input.confirmSelf ? { confirmSelf: true } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        result?: string;
        changed?: boolean;
        error?: string;
      } | null;

      if (!response.ok) {
        setError(
          ERROR_COPY[body?.error ?? ""] ??
            `That did not go through (${response.status}).`,
        );
        return;
      }

      const wasSelf = pending.id === data.organiserId;
      if (pending.action === "promote") {
        setAdmins((current) =>
          current.some((a) => a.id === pending.id)
            ? current
            : [
                ...current,
                {
                  id: pending.id,
                  displayName: pending.name,
                  email: pending.email,
                  addedAt: new Date().toISOString(),
                },
              ],
        );
      } else {
        setAdmins((current) => current.filter((a) => a.id !== pending.id));
      }
      toast.push(
        "ok",
        body?.changed === false
          ? "Nothing to change — they were already in that state."
          : pending.action === "promote"
            ? `${pending.name} is now an admin.`
            : `${pending.name} is no longer an admin.`,
      );
      setPending(null);
      // Removing your own access ends this session's right to see the page.
      if (wasSelf && pending.action === "demote") window.location.reload();
    } catch {
      setError("Network error — nothing was changed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <InfoBanner tone="warn">
        <strong>Admin access is full control</strong> — content, tickets, orders
        and financial figures, other people&rsquo;s account data, and the power
        to make or remove other admins. Every promotion and removal is recorded
        in the audit log. The last admin can never be removed.
      </InfoBanner>

      <Panel
        title={`Admins (${admins.length})`}
        subtitle="Everyone who can sign in to this dashboard right now."
      >
        <ul className="flex flex-col divide-y divide-black02/10">
          {admins.map((admin) => {
            const isSelf = admin.id === data.organiserId;
            const name = nameOf(admin.id, admin.displayName, admin.email);
            const blocked = onlyOneAdmin;
            return (
              <li
                key={admin.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ShieldCheck
                    size={22}
                    weight="fill"
                    aria-hidden
                    className="shrink-0 text-black02"
                  />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-sans text-body-m font-bold text-black02">
                      {name}
                      {isSelf && (
                        <Badge tone="primary" variant="outline">
                          You
                        </Badge>
                      )}
                    </p>
                    <p className="break-all font-mono text-caption text-black02/70">
                      {admin.email ?? "no email on file"} · admin since{" "}
                      {when(admin.addedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    disabled={blocked}
                    aria-describedby={blocked ? "last-admin-note" : undefined}
                    onClick={() =>
                      open("demote", admin.id, admin.displayName, admin.email)
                    }
                    className="rounded-pill border-2 border-danger px-4 py-1.5 font-sans text-caption font-bold text-danger-ink hover:bg-danger-pastel disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    {isSelf ? "Remove my access" : "Remove admin"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {onlyOneAdmin && (
          <p
            id="last-admin-note"
            className="mt-3 rounded-lg border border-black02/15 bg-pastel px-4 py-3 text-body-m text-black02"
          >
            This is the only admin, so it can&rsquo;t be removed — the dashboard
            must always have at least one. Make someone else an admin first
            (below), and this unlocks.
          </p>
        )}
      </Panel>

      <Panel
        title={`Volunteers (${activeVolunteerIds.size})`}
        subtitle="Day-of helpers. They can only use the day-of tools — door check-in, meal & swag, merch pickup — never this dashboard. Access ends by itself at 23:59 the day after the event."
      >
        {volunteers.length === 0 ? (
          <p className="text-body-m text-black02/70">
            No volunteers yet. Ask each one to sign in to the site once, then
            use “Make volunteer” in the list below.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-black02/10">
            {volunteers.map((volunteer) => {
              const name = nameOf(
                volunteer.id,
                volunteer.displayName,
                volunteer.email,
              );
              const active = activeVolunteerIds.has(volunteer.id);
              return (
                <li
                  key={volunteer.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <HandWaving
                      size={22}
                      weight="duotone"
                      aria-hidden
                      className="shrink-0 text-black02"
                    />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-sans text-body-m font-bold text-black02">
                        {name}
                        {!active && (
                          <Badge tone="danger" variant="outline">
                            Expired
                          </Badge>
                        )}
                      </p>
                      <p className="break-all font-mono text-caption text-black02/70">
                        {volunteer.email ?? "no email on file"} ·{" "}
                        {active ? "until" : "ended"} {when(volunteer.expiresAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={volunteerBusy === volunteer.id}
                    onClick={() =>
                      void changeVolunteer(
                        "remove",
                        volunteer.id,
                        name,
                        volunteer.email,
                      )
                    }
                    className="rounded-pill border-2 border-danger px-4 py-1.5 font-sans text-caption font-bold text-danger-ink hover:bg-danger-pastel disabled:opacity-40"
                  >
                    Remove volunteer
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Users who have signed in"
        subtitle={`Showing ${shownUsers.length} of ${data.users.total}${
          data.users.total > LIST_CAP ? ` (first ${LIST_CAP} loaded)` : ""
        }. To make somebody an admin or a volunteer they must have signed in once.`}
        action={
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find by name or email"
            aria-label="Find a user by name or email"
            className="w-64 max-w-full rounded-pill border border-black02/25 bg-offwhite px-4 py-2 text-body-m text-black02 outline-none focus:border-black02"
          />
        }
      >
        {/*
          PII restraint, and the reasoning rather than a blanket rule.

          This list is for browsing — "how many people have accounts", "did this
          person ever sign in" — and nobody is contacted from it, so addresses
          are masked. Where an address IS the point of the row, on a ticket to
          email or an order to fulfil — or the admin list above, where the whole
          point is seeing exactly who holds access — it is shown in full: masking
          it there would only mean someone copies it out of the database instead,
          which is worse. The confirmation for a role change shows the full
          address for the same reason. There is no export here: a CSV of every
          member's address is not a thing this dashboard needs to produce in one
          click.

          No tokens, no session data, no IP addresses. `profiles` holds none of
          those; the DP wall's `submitter_ip` is never read into this dashboard.
        */}
        <DataTable
          headers={["Name", "Email", "Signed up", "Access"]}
          empty={
            query ? "Nobody matches that search." : "Nobody has signed in yet."
          }
          rows={shownUsers.map((u) => [
            u.displayName ?? "—",
            <span key="e" className="font-mono text-caption">
              {maskEmail(u.email)}
            </span>,
            when(u.createdAt),
            adminIds.has(u.id) ? (
              <Badge key="a" tone="success" variant="outline">
                Admin
              </Badge>
            ) : (
              <span key="a" className="flex flex-wrap gap-2">
                {activeVolunteerIds.has(u.id) ? (
                  <Badge tone="primary" variant="outline">
                    Volunteer
                  </Badge>
                ) : (
                  <button
                    type="button"
                    disabled={volunteerBusy === u.id}
                    onClick={() =>
                      void changeVolunteer(
                        "add",
                        u.id,
                        nameOf(u.id, u.displayName, u.email),
                        u.email,
                      )
                    }
                    className="rounded-pill border-2 border-black02 bg-primary px-4 py-1.5 font-sans text-caption font-bold text-black02 hover:bg-halftone disabled:opacity-40"
                  >
                    Make volunteer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => open("promote", u.id, u.displayName, u.email)}
                  className="rounded-pill border-2 border-black02 px-4 py-1.5 font-sans text-caption font-bold text-black02 hover:bg-primary"
                >
                  Make admin
                </button>
              </span>
            ),
          ])}
        />
      </Panel>

      {pending && (
        <ConfirmRoleChangeModal
          // Keyed, so typed text and the "I understand" tick can never carry
          // over from one person or action to another.
          key={`${pending.action}:${pending.id}`}
          action={pending.action}
          target={{ name: pending.name, email: pending.email }}
          isSelf={pending.id === data.organiserId}
          busy={busy}
          error={error}
          onConfirm={(input) => void submit(input)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
