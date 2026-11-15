"use client";

import { Clock } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Modal } from "@/components/ui/Modal";
import { APPAREL_SIZES } from "@/lib/tickets/self-edit";
import { MOBILE_QUERY, useMediaQuery } from "@/lib/use-media-query";

export interface EditableTicket {
  id: string;
  attendeeName: string;
  apparelSize: string | null;
  includesApparel: boolean;
}

/**
 * The small "edit your ticket" form (ADR 0075): the attendee's name, and the
 * T-shirt size on a tier that includes one. Nothing else is offered —
 * and the server refuses anything else anyway.
 *
 * Dialog on desktop, the shared bottom sheet on a phone (the same split the
 * speaker cards use), so there is one focus trap and one dismissal contract
 * per surface rather than a third overlay. The "until Wed 18 Nov, 23:59"
 * hint stays visible the whole time the form is open.
 */
export function TicketEditor({
  ticket,
  open,
  onClose,
  onSaved,
  deadline,
}: {
  ticket: EditableTicket;
  open: boolean;
  onClose: () => void;
  onSaved: (next: { attendeeName: string; apparelSize: string | null }) => void;
  /** Already formatted in Yaoundé time. */
  deadline: { date: string; time: string } | null;
}) {
  const t = useTranslations("pages.account.ticketEdit");
  const tc = useTranslations("common");
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const titleId = useId();
  const [name, setName] = useState(ticket.attendeeName);
  const [size, setSize] = useState(ticket.apparelSize ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameChanged = name.trim() !== ticket.attendeeName;
  const sizeChanged =
    ticket.includesApparel && size !== (ticket.apparelSize ?? "");
  const canSave =
    !saving && name.trim().length >= 2 && (nameChanged || sizeChanged);

  async function save() {
    setSaving(true);
    setError(null);
    const body: Record<string, string> = {};
    if (nameChanged) body.attendeeName = name.trim();
    if (sizeChanged && size) body.apparelSize = size;
    try {
      const res = await fetch(`/api/account/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(json.error ?? "server_error"));
        setSaving(false);
        return;
      }
      onSaved({
        attendeeName: json.ticket.attendeeName,
        apparelSize: json.ticket.apparelSize,
      });
    } catch {
      setError("server_error");
      setSaving(false);
    }
  }

  const form = (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) void save();
      }}
    >
      {deadline && (
        <p className="flex items-start gap-2 rounded-lg border-2 border-black02 bg-primary px-4 py-3 text-body-m font-bold text-black02">
          <Clock
            size={20}
            weight="bold"
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          {t("editHint", deadline)}
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-body-m font-bold text-black02">
          {t("nameLabel")}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="name"
          className="rounded-lg border-2 border-black02 bg-offwhite px-4 py-2.5 text-body-m text-black02"
        />
        <span className="text-caption text-black02/65">{t("nameHint")}</span>
      </label>

      {ticket.includesApparel && (
        <fieldset>
          <legend className="text-body-m font-bold text-black02">
            {t("sizeLabel")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {APPAREL_SIZES.map((s) => (
              <label key={s} className="cursor-pointer">
                <input
                  type="radio"
                  name={`size-${ticket.id}`}
                  value={s}
                  checked={size === s}
                  onChange={() => setSize(s)}
                  className="peer sr-only"
                />
                <span className="inline-flex min-w-12 justify-center rounded-pill border-2 border-black02 px-3.5 py-1.5 font-mono text-mono-tag font-bold text-black02 transition-colors peer-checked:bg-black02 peer-checked:text-offwhite peer-focus-visible:ring-2 peer-focus-visible:ring-primary hover:bg-pastel">
                  {s}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border-2 border-danger bg-danger-pastel px-4 py-3 text-body-m font-bold text-black02"
        >
          {t(`errors.${error}` as "errors.server_error")}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center rounded-pill border-2 border-black02 bg-primary px-6 py-3 font-sans text-body-m font-bold text-black02 shadow-[0_4px_0_0_var(--color-black02)] transition-transform duration-200 ease-bouncy hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 motion-reduce:transform-none"
        >
          {saving ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center rounded-pill border-2 border-black02 px-6 py-3 font-sans text-body-m font-bold text-black02 hover:bg-pastel"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        title={t("editTitle")}
        closeLabel={tc("close")}
      >
        {form}
      </BottomSheet>
    );
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      closeLabel={tc("close")}
    >
      <div className="flex flex-col gap-5 p-2 sm:p-4">
        <h2
          id={titleId}
          className="font-sans text-heading-l font-bold text-black02"
        >
          {t("editTitle")}
        </h2>
        {form}
      </div>
    </Modal>
  );
}
