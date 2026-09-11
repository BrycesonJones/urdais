"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { CheckIcon } from "@/components/icons/check-icon";
import { ChevronDownIcon } from "@/components/icons/chevron-down-icon";

export type SelectMenuOption = {
  id: string;
  label: string;
};

type SelectMenuProps = {
  /** Accessible name of the control, e.g. "Instrument". */
  label: string;
  options: SelectMenuOption[];
  /** Id of the selected option; null when nothing is selected. */
  value: string | null;
  onChange: (id: string) => void;
  /** Closed-state trigger content. */
  children: React.ReactNode;
  /** Primary triggers read as the main choice; secondary ones sit a step back. */
  emphasis?: "primary" | "secondary";
  className?: string;
};

/** Cobalt focus outline shared by the market selectors; rest states stay neutral. */
export const SELECTOR_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8ca4ff]";

/** Rectangular dark trigger surface shared by the market selectors. */
export const SELECTOR_SURFACE =
  "h-9 rounded-[3px] border border-white/10 bg-[#111111] text-sm transition-colors hover:border-white/20 hover:bg-[#161616]";

/**
 * Small Urdais-owned select menu: a button trigger that opens a listbox
 * directly beneath it. The listbox takes focus while open and tracks an
 * active option with aria-activedescendant; Arrow keys move, Enter or Space
 * selects, Escape closes, and focus returns to the trigger. Pointer presses
 * outside close it, which also means opening another menu closes this one.
 * The document listener exists only while the menu is open.
 */
export function SelectMenu({
  label,
  options,
  value,
  onChange,
  children,
  emphasis = "primary",
  className,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function openMenu() {
    const selected = options.findIndex((option) => option.id === value);
    setActiveIndex(selected >= 0 ? selected : 0);
    setOpen(true);
  }

  function closeMenu(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function select(index: number) {
    const option = options[index];
    if (option) onChange(option.id);
    closeMenu(true);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        // Let focus move on naturally, but do not leave a menu behind.
        setOpen(false);
        break;
    }
  }

  const triggerTone =
    emphasis === "primary"
      ? "font-medium text-neutral-100"
      : "text-neutral-400 hover:text-neutral-200";

  return (
    <div ref={rootRef} className={["relative", className].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-3 pl-3 pr-2.5 ${SELECTOR_SURFACE} ${triggerTone} ${SELECTOR_FOCUS} ${
          open ? "border-white/20 bg-[#161616]" : ""
        }`}
      >
        <span className="flex min-w-0 items-baseline gap-1.5 truncate">{children}</span>
        <ChevronDownIcon className={`size-3.5 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={optionId(activeIndex)}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          className="absolute left-0 z-30 mt-1 min-w-full rounded-[3px] border border-white/10 bg-[#0e0e0e] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)] outline-none"
        >
          {options.map((option, index) => {
            const selected = option.id === value;
            const active = index === activeIndex;
            return (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => select(index)}
                className={`flex cursor-pointer items-center justify-between gap-6 whitespace-nowrap px-3 py-2 text-sm ${
                  selected ? "text-neutral-50" : "text-neutral-400"
                } ${active ? "bg-white/[0.06] text-neutral-100" : ""}`}
              >
                <span>{option.label}</span>
                <CheckIcon className={`size-3.5 shrink-0 text-neutral-50 ${selected ? "" : "invisible"}`} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
