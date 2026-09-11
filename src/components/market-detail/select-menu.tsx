"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode, RefObject } from "react";

import { CheckIcon } from "@/components/icons/check-icon";
import { ChevronDownIcon } from "@/components/icons/chevron-down-icon";

export type SelectMenuOption = {
  id: string;
  label: string;
};

/** Cobalt focus outline shared by the market selectors; rest states stay neutral. */
export const SELECTOR_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8ca4ff]";

/** Rectangular dark trigger surface shared by the market selectors. */
export const SELECTOR_SURFACE =
  "h-9 rounded-[3px] border border-white/10 bg-[#111111] text-sm transition-colors hover:border-white/20 hover:bg-[#161616]";

const POPOVER_CLASS =
  "absolute z-30 mt-1 min-w-full rounded-[3px] border border-white/10 bg-[#0e0e0e] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]";

/**
 * Popovers open left-aligned under their trigger. One that is wider than
 * its trigger and sits near the right edge of the viewport would spill
 * out, so after opening it is measured and, if needed, right-aligned. The
 * adjustment is made on the element directly: it is layout, not state.
 */
function usePopoverAlignment(open: boolean, popoverRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!open || !popover) return;
    popover.style.left = "0";
    popover.style.right = "auto";
    if (popover.getBoundingClientRect().right > window.innerWidth - 8) {
      popover.style.left = "auto";
      popover.style.right = "0";
    }
  }, [open, popoverRef]);
}

/**
 * Open state shared by the menus: pointer presses outside close it (so
 * opening another menu closes this one), and so does focus leaving the
 * root. The document listener exists only while the menu is open.
 */
function useMenuOpen(rootRef: RefObject<HTMLDivElement | null>) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, rootRef]);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (rootRef.current && !rootRef.current.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  return { open, setOpen, handleBlur };
}

/** Moves an active index in response to listbox navigation keys; returns null for other keys. */
function navigate(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
      return Math.min(index + 1, count - 1);
    case "ArrowUp":
      return Math.max(index - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

type TriggerProps = {
  label: string;
  open: boolean;
  listId: string;
  emphasis: "primary" | "secondary";
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

function MenuTrigger({ label, open, listId, emphasis, onClick, onKeyDown, triggerRef, children }: TriggerProps) {
  const tone = emphasis === "primary" ? "font-medium text-neutral-100" : "text-neutral-400 hover:text-neutral-200";
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`flex w-full items-center justify-between gap-3 pl-3 pr-2.5 ${SELECTOR_SURFACE} ${tone} ${SELECTOR_FOCUS} ${
        open ? "border-white/20 bg-[#161616]" : ""
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">{children}</span>
      <ChevronDownIcon className={`size-3.5 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

function OptionRow({
  id,
  label,
  selected,
  active,
  disabled,
  onHover,
  onPick,
}: {
  id: string;
  label: string;
  selected: boolean;
  active: boolean;
  disabled?: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      onPointerMove={onHover}
      onClick={disabled ? undefined : onPick}
      className={`flex items-center justify-between gap-6 whitespace-nowrap px-3 py-2 text-sm ${
        disabled ? "cursor-not-allowed text-neutral-600" : selected ? "cursor-pointer text-neutral-50" : "cursor-pointer text-neutral-400"
      } ${active && !disabled ? "bg-white/[0.06] text-neutral-100" : ""}`}
    >
      <span>{label}</span>
      <CheckIcon className={`size-3.5 shrink-0 text-neutral-50 ${selected ? "" : "invisible"}`} />
    </li>
  );
}

type SelectMenuProps = {
  /** Accessible name of the control, e.g. "Instrument". */
  label: string;
  options: SelectMenuOption[];
  /** Id of the selected option; null when nothing is selected. */
  value: string | null;
  onChange: (id: string) => void;
  /** Closed-state trigger content. */
  children: ReactNode;
  /** Primary triggers read as the main choice; secondary ones sit a step back. */
  emphasis?: "primary" | "secondary";
  className?: string;
};

/**
 * Small Urdais-owned single-select menu: a button trigger that opens a
 * listbox directly beneath it. The listbox takes focus while open and
 * tracks an active option with aria-activedescendant; Arrow keys move,
 * Enter or Space selects and closes, Escape closes, and focus returns to
 * the trigger.
 */
export function SelectMenu({ label, options, value, onChange, children, emphasis = "primary", className }: SelectMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { open, setOpen, handleBlur } = useMenuOpen(rootRef);
  usePopoverAlignment(open, listRef);
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useEffect(() => {
    if (open) listRef.current?.focus();
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
    const next = navigate(event.key, activeIndex, options.length);
    if (next !== null) {
      event.preventDefault();
      setActiveIndex(next);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    }
  }

  return (
    <div ref={rootRef} onBlur={handleBlur} className={["relative", className].filter(Boolean).join(" ")}>
      <MenuTrigger
        label={label}
        open={open}
        listId={listId}
        emphasis={emphasis}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        triggerRef={triggerRef}
      >
        {children}
      </MenuTrigger>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={optionId(activeIndex)}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          className={`${POPOVER_CLASS} outline-none`}
        >
          {options.map((option, index) => (
            <OptionRow
              key={option.id}
              id={optionId(index)}
              label={option.label}
              selected={option.id === value}
              active={index === activeIndex}
              onHover={() => setActiveIndex(index)}
              onPick={() => select(index)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type MultiSelectMenuProps = {
  /** Accessible name of the control, e.g. "Compare with". */
  label: string;
  options: SelectMenuOption[];
  /** Ids of the selected options, in selection order. */
  selected: string[];
  /** Most options that may be selected at once. */
  max: number;
  onToggle: (id: string) => void;
  onClear: () => void;
  /** Shown beneath the options once the limit is reached. */
  limitNote: string;
  /** Closed-state trigger content. */
  children: ReactNode;
  emphasis?: "primary" | "secondary";
  className?: string;
};

/**
 * Multi-select sibling of SelectMenu: the listbox is aria-multiselectable,
 * Enter or Space toggles the active option and keeps the menu open, and
 * once `max` options are selected the rest are disabled while selected ones
 * stay removable. A real button beneath the list clears everything and is
 * reached with Tab; focus leaving the control closes it.
 */
export function MultiSelectMenu({
  label,
  options,
  selected,
  max,
  onToggle,
  onClear,
  limitNote,
  children,
  emphasis = "secondary",
  className,
}: MultiSelectMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { open, setOpen, handleBlur } = useMenuOpen(rootRef);
  usePopoverAlignment(open, popoverRef);
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const atLimit = selected.length >= max;

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function openMenu() {
    setActiveIndex(0);
    setOpen(true);
  }

  function closeMenu(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function isDisabled(id: string) {
    return atLimit && !selected.includes(id);
  }

  function toggle(index: number) {
    const option = options[index];
    if (option && !isDisabled(option.id)) onToggle(option.id);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const next = navigate(event.key, activeIndex, options.length);
    if (next !== null) {
      event.preventDefault();
      setActiveIndex(next);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    }
  }

  function handleClearKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    }
  }

  return (
    <div ref={rootRef} onBlur={handleBlur} className={["relative", className].filter(Boolean).join(" ")}>
      <MenuTrigger
        label={label}
        open={open}
        listId={listId}
        emphasis={emphasis}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        triggerRef={triggerRef}
      >
        {children}
      </MenuTrigger>

      {open && (
        <div ref={popoverRef} className={POPOVER_CLASS}>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            aria-activedescendant={optionId(activeIndex)}
            tabIndex={-1}
            onKeyDown={handleListKeyDown}
            className="outline-none"
          >
            {options.map((option, index) => (
              <OptionRow
                key={option.id}
                id={optionId(index)}
                label={option.label}
                selected={selected.includes(option.id)}
                active={index === activeIndex}
                disabled={isDisabled(option.id)}
                onHover={() => setActiveIndex(index)}
                onPick={() => toggle(index)}
              />
            ))}
          </ul>
          <div className="mt-1 flex items-center justify-between gap-4 border-t border-white/10 px-3 pb-1 pt-2 text-xs">
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => {
                onClear();
                closeMenu(true);
              }}
              onKeyDown={handleClearKeyDown}
              className={`rounded-[2px] text-neutral-400 transition-colors hover:text-neutral-100 disabled:cursor-default disabled:text-neutral-600 ${SELECTOR_FOCUS}`}
            >
              Clear comparisons
            </button>
            {atLimit && <span className="whitespace-nowrap text-neutral-500">{limitNote}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
