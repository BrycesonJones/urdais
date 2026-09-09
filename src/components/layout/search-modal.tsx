"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";

import { SearchIcon } from "@/components/icons/search-icon";

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * UI-only search dialog shell.
 *
 * Built on the native <dialog> element so that modal semantics, the top
 * layer, Escape handling, and focus restoration come from the platform
 * rather than hand-rolled event listeners. The `open` prop is the source of
 * truth; the effect below keeps the DOM dialog in sync with it.
 */
export function SearchModal({ open, onClose }: SearchModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
      inputRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fired for Escape, programmatic close(), and the close button alike.
  function handleClose() {
    setQuery("");
    onClose();
  }

  // The dialog element itself covers the viewport and acts as the backdrop;
  // a click whose target is the dialog (not a descendant) landed outside the panel.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Search is not implemented yet; never navigate on submit.
    event.preventDefault();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search Urdais"
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col items-center bg-black/60 px-4 pt-[12vh] text-neutral-100 backdrop:bg-transparent open:flex"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-white/10 bg-neutral-900 shadow-2xl shadow-black/50">
        <form
          role="search"
          onSubmit={handleSubmit}
          className="flex items-center gap-3 border-b border-white/10 px-4"
        >
          <SearchIcon className="size-5 shrink-0 text-neutral-500" />
          {/*
            A plain text input rather than type="search": Chrome makes the
            first Escape in a non-empty search input clear it instead of
            reaching the dialog, which would break "Escape closes the modal".
          */}
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            enterKeyHint="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search Urdais"
            placeholder="Search instruments, indices, and markets"
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-neutral-100 outline-none placeholder:text-neutral-500"
          />
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-sans text-[11px] font-medium text-neutral-500 sm:inline-block">
            Esc
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
              className="size-4"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </form>

        <div className="px-4 py-8 text-center text-sm text-neutral-500">
          Search functionality coming soon.
        </div>
      </div>
    </dialog>
  );
}
