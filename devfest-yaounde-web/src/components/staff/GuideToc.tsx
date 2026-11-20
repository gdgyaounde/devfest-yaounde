"use client";

import { useEffect, useState } from "react";

/**
 * The guide's table of contents (ADR 0090). On a phone it is a row of chips
 * above the sections; from `lg` it sits in the left margin, stuck to the top
 * while you read, with the section you are in highlighted.
 */
export function GuideToc({
  items,
  label,
}: {
  items: { id: string; title: string }[];
  label: string;
}) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost section that is at least partly in the upper half.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -60% 0px" },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <>
      {/* Phone / tablet: chips */}
      <nav aria-label={label} className="lg:hidden">
        <ol className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="inline-flex items-center gap-1.5 rounded-pill border-2 border-black02 bg-offwhite px-3 py-1.5 font-sans text-caption font-bold text-black02"
              >
                <span className="font-mono text-black02/60">{i + 1}</span>
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Desktop: sticky in the margin */}
      <nav
        aria-label={label}
        className="sticky top-6 hidden self-start lg:block"
      >
        <p className="mb-3 font-mono text-mono-tag font-bold uppercase tracking-wide text-black02/65">
          {label}
        </p>
        <ol className="flex flex-col gap-1 border-l-2 border-black02/20">
          {items.map((item, i) => {
            const on = item.id === active;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={on ? "location" : undefined}
                  className={`-ml-0.5 flex items-start gap-2.5 border-l-2 py-1.5 pl-3 pr-2 font-sans text-body-m transition-colors duration-200 ${
                    on
                      ? "border-black02 font-bold text-black02"
                      : "border-transparent text-black02/70 hover:text-black02"
                  }`}
                >
                  <span className="font-mono text-caption text-black02/55">
                    {i + 1}
                  </span>
                  {item.title}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
