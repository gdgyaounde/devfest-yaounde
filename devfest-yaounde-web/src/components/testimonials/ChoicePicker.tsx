"use client";

import { CaretUp, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { calmIn } from "@/lib/motion";

export const OTHER = "__other";

/**
 * A pill that opens a small sheet of pill options above it — the storytime
 * page's role and edition pickers (ADR 0087), instead of native selects that
 * look like a form. Picking "Other…" turns the pill into a short text field.
 *
 * Plain buttons throughout (Tab and Enter work), `aria-expanded` on the
 * trigger, `aria-pressed` on the options; Escape or a click outside closes.
 */
export function ChoicePicker({
  label,
  placeholder,
  options,
  value,
  onChange,
  otherLabel,
  otherValue,
  onOtherChange,
  otherMax,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  otherLabel: string;
  otherValue: string;
  onOtherChange: (value: string) => void;
  otherMax: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    root.current?.querySelector<HTMLElement>("[data-choice-option]")?.focus();
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    if (v === OTHER) window.setTimeout(() => otherRef.current?.focus(), 30);
  };

  const current = options.find((o) => o.value === value)?.label;
  const pill =
    "inline-flex items-center gap-2 rounded-pill border-2 px-4 py-2 font-sans text-body-m transition-[background-color,border-color,color] duration-300";

  if (value === OTHER) {
    return (
      <div className={`${calmIn} ${pill} border-black02 bg-offwhite`}>
        <input
          ref={otherRef}
          aria-label={label}
          value={otherValue}
          maxLength={otherMax}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder={otherLabel}
          className="w-36 bg-transparent text-black02 placeholder:text-black02/40 focus:outline-none"
        />
        <button
          type="button"
          aria-label={placeholder}
          onClick={() => {
            onOtherChange("");
            onChange("");
          }}
          className="text-black02/60 hover:text-black02"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`${pill} ${
          current
            ? "border-black02 bg-offwhite font-bold text-black02"
            : "border-black02/25 text-black02/70 hover:border-black02/60 hover:text-black02"
        }`}
      >
        <span className="sr-only">{label}: </span>
        {current ?? placeholder}
        <CaretUp
          size={14}
          weight="bold"
          aria-hidden
          className={`transition-transform duration-300 ${open ? "" : "rotate-180"}`}
        />
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className={`${calmIn} absolute bottom-full left-0 z-30 mb-3 w-[min(88vw,26rem)] rounded-lg border-2 border-black02 bg-offwhite p-3 shadow-[0_6px_0_0_var(--color-black02)]`}
          style={{ animationDuration: "500ms" }}
        >
          <div className="flex flex-wrap gap-2">
            {[...options, { value: OTHER, label: otherLabel }].map((o) => {
              const on = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  data-choice-option
                  aria-pressed={on}
                  onClick={() => pick(on ? "" : o.value)}
                  className={`rounded-pill border-2 px-3.5 py-1.5 font-sans text-body-m transition-colors duration-200 ${
                    on
                      ? "border-black02 bg-primary font-bold text-black02"
                      : "border-black02/20 text-black02 hover:border-black02 hover:bg-pastel"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
